/* eslint-disable no-underscore-dangle */

/**
 * Denormalization
 */
import { _ } from 'underscore'
import { s } from 'underscore.string'

import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { SimpleSchema } from 'meteor/aldeed:simple-schema'

import { debug, extend } from './tools.js'

// ERRORS (export needed for tests)
export const ERROR_IDENTIFIERT_EXISTS = 'identifier already exists'
export const ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT = 'sourceCollection and targetCollection need to refer to different collections'
export const ERROR_SYNC_NEEDS_TO_HAVE_CONTENT = 'sync needs to have properties attached'
export const ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS = 'a sync already exists for the given sourceCollection and targetCollection'
export const ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION = 'triggerCollection can NOT be set to sourceCollection or targetCollection. It is meant to be registered to a related collection.'
export const ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID = 'identifier in refreshByCollection() needs to be a registered syncronisation. It has to be registered before via addSyncronisation()'

// Storage for ALL system-wide syncronisations
export const SyncronisationStore = []

// ===========================================================
// DENORMALIZED-VIEWS CLASS
// ===========================================================
export const DenormalizedViews = class DenormalizedViews {
  // ================================================
  // PUBLIC API (to be used from outside)

  static addSyncronisation(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      sourceCollection: { type: Mongo.Collection },
      targetCollection: { type: Mongo.Collection },
      pick: { type: [String], optional: true },
      sync: { type: Object, blackbox: true },
      postSync: { type: Object, blackbox: true, optional: true },
    }).validate(options)

    const { identifier, sourceCollection, targetCollection, pick, sync, postSync } = options

    // Validate options
    // validate that identifier is NOT yet registered
    if (_.contains(_.pluck(SyncronisationStore, 'identifier'), identifier)) {
      throw new Error(`${ERROR_IDENTIFIERT_EXISTS}: ${identifier}`)
    }
    // validate that collections are NOT the same
    if (sourceCollection===targetCollection) {
      throw new Error(ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT)
    }
    if (_.isEmpty(sync)) {
      throw new Error(ERROR_SYNC_NEEDS_TO_HAVE_CONTENT)
    }
    if (_.find(SyncronisationStore, (store) => {
            return (store.sourceCollection===sourceCollection
              && store.targetCollection===targetCollection)
       })) {
      throw new Error(ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS)
    }
    // is valid? Register it
    debug(`addSyncronisation from sourceCollection "${sourceCollection._name}" to "${targetCollection._name}"`)
    SyncronisationStore.push(options)

    // register hooks to sourceCollection
    // those hooks wil sync to targetCollection
    sourceCollection.after.insert(function(userId, doc) {
      debug(`${sourceCollection._name}.after.insert`)
      // fix for insert-hook
      doc._id = doc._id.insertedIds[0]
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: options,
      })
      targetCollection.insert(doc)
    })

    sourceCollection.after.update(function(userId, doc, fieldNames, modifier) {
      debug(`${sourceCollection._name}.after.update`)
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: options,
      })

      targetCollection.update(doc._id, { $set: doc })
    })

    sourceCollection.after.remove(function(userId, doc) {
      debug(`${sourceCollection._name}.after.remove`)
      targetCollection.remove(doc._id)
    })
  }

  static refreshByCollection(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      triggerCollection: { type: Mongo.Collection },
      refreshIds: { type: Function },
    }).validate(options)

    const { identifier, triggerCollection, refreshIds } = options

    // Validate
    const existingSyncronisation = DenormalizedViews._getExistingSyncronisation({ identifier })
    // validate that we have a valid identifier
    if (!existingSyncronisation) {
      throw new Error(ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID)
    }
    // validate that we have a valid collection assigned
    if (existingSyncronisation.sourceCollection===triggerCollection
      || existingSyncronisation.targetCollection===triggerCollection) {
      throw new Error(ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION)
    }

    debug(`setup refreshByCollection for identifier "${identifier}" and triggerCollection "${triggerCollection._name}"`)

    triggerCollection.after.insert(function(userId, doc) {
      debug(`triggerCollection ${triggerCollection._name}.after.insert`)
      doc._id = doc._id.insertedIds[0]  // fix for insert-hook
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      }
    })

    triggerCollection.after.update(function(userId, doc, fieldNames, modifier) {
      debug(`triggerCollection ${triggerCollection._name}.after.update`)
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      }
    })

    // REMOVE hook
    // our aim is to always UPDATE the "view"-collection. P.e. if Author changes
    // his name or gets deleted than the "view"-collection needs to refresh.
    // Of course in this case the App itself would have to make sure that
    // before authorId is removed from sourceCollection
    triggerCollection.after.remove(function(userId, doc) {
      debug(`triggerCollection ${triggerCollection._name}.after.remove`, doc)
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      }
    })
  }

  static refreshManually(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      refreshIds: { type: [String] },
    }).validate(options)

    const { identifier, refreshIds } = options

    // TODOD
  }


  /**
   * Process a given doc by "sync"- and "postSync" options
   *
   * @param  {Object} options [description]
   * @return {Object} doc that contains the collected data
   */
  static _processDoc(options = {}) {
    new SimpleSchema({
      // mandatory
      doc: { type: Object, blackbox: true },
      syncronisation: { type: Object, blackbox: true },
      // optional
      userId: { type: String, optional: true },
    }).validate(options)

    const { syncronisation, userId } = options
    const { sourceCollection, targetCollection, sync, postSync, pick } = syncronisation
    let doc = options.doc

    // Loop each property set in "sync"
    // and assign its return-value to the doc
    for (const property of Object.getOwnPropertyNames(sync)) {
      const propertyFunction = sync[property]
      if (!_.isFunction(propertyFunction)) {
        throw new Error(`sync.${property} needs to be a function`)
      }

      // call the function
      // and assign its result to the object
      const result = propertyFunction.call(this, doc, userId)
      // if there is a result: assign it to doc
      if (result) {
        doc[property] = result
      } else {
        delete doc[property]
        // we are using a $set operation which will ADD,
        // but NOT remove a property. So in this special case
        // we need to do an extra write to the db and unset
        DenormalizedViews._unsetProperty({ property, _id: doc._id, collection: targetCollection })
      }
    }

    // Loop each property set in "postSync"
    // and assign its return-value to the doc
    if (postSync) {
      for (const property of Object.getOwnPropertyNames(postSync)) {
        const propertyFunction = postSync[property]
        if (!_.isFunction(propertyFunction)) {
          throw new Error(`postSync.${property} needs to be a function`)
        }

        // call the function
        // and assign its result to the object
        const result = propertyFunction.call(this, doc, userId)
        // if there is a result: assign it to doc
        if (result) {
          doc[property] = result
        } else {
          delete doc[property]
          // we are using a $set operation which will ADD,
          // but NOT remove a property. So in this special case
          // we need to do an extra write to the db and unset
          DenormalizedViews._unsetProperty({ property, _id: doc._id, collection: targetCollection })
        }
      }
    }

    // pick
    if (pick) {
      doc = _.pick(doc, _.union(
        pick,
        Object.getOwnPropertyNames(sync),
        Object.getOwnPropertyNames(postSync)
      ))
    }

    debug('doc AFTER process', doc)

    return doc
  }

  /**
   * Refreshes (=updates) the given ids in a syncronisation.
   *
   * To be used within insert- and update-hooks.
   * In remove hooks: use ``_removeIds```
   *
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  static _updateIds(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      idsToRefresh: { type: [String] },
      userId: { type: String, optional: true },
    }).validate(options)

    const { identifier, idsToRefresh, userId } = options

    const existingSyncronisation = DenormalizedViews._getExistingSyncronisation({ identifier })

    for (const id of idsToRefresh) {
      let doc = existingSyncronisation.sourceCollection.findOne(id)
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: existingSyncronisation,
      })

      existingSyncronisation.targetCollection.update(doc._id, { $set: doc })
    }
  }

  /**
   * return an exising syncronisation by a given identifier
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  static _getExistingSyncronisation(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
    }).validate(options)

    const { identifier } = options

    return _.find(SyncronisationStore, (store) => {
      return store.identifier===identifier
    })
  }

  /**
   * Helper function which is used in refreshByCollection
   *  to validate the refreshIds-property.
   *
   * Validate that we have a function.
   * Validate that the function returns either undefined, [String] or []
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  static _validateAndCallRefreshIds(options = {}) {
    new SimpleSchema({
      doc: { type: Object, blackbox: true },
      refreshIds: { type: Function },
      userId: { type: String, optional: true },
    }).validate(options)

    const { doc, userId, refreshIds } = options

    // validate that we have a function
    if (!_.isFunction(refreshIds)) {
      throw new Error('refreshByCollection.refreshIds needs to be a function')
    }
    // validate that the refreshIds-function returns either
    // undefined, [String] or []
    const ids = refreshIds.call(this, doc, userId)
    if (! (Match.test(ids, [String]) || !_.isUndefined() || ids===[] )) {
      throw new Error(`refreshByCollection.refreshIds needs to return an array of strings, an empty array or undefined, BUT it returned "${ids}"`)
    }

    return ids
  }

  /**
   * This is a quick and dirty solution to remove a property.
   *
   * We should make this better and minimize writes to the collection,
   * this will do it for now.
   *
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  static _unsetProperty(options = {}) {
    new SimpleSchema({
      _id: { type: String },
      collection: { type: Mongo.Collection },
      property: { type: String },
    }).validate(options)

    const { _id, collection, property } = options

    collection.update(_id, JSON.parse(`{ "$unset": { "${property}": 1 } }`))
  }


}
DenormalizedViews.Debug = false

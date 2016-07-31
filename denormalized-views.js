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
export const ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT = 'sourceCollection and viewCollection need to refer to different collections'
export const ERROR_SYNC_NEEDS_TO_HAVE_CONTENT = 'sync needs to have properties attached'
export const ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS = 'a sync already exists for the given sourceCollection and viewCollection'
export const ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION = 'relatedCollection can NOT be set to sourceCollection or viewCollection. It is meant to be registered to a related collection.'
export const ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID = 'identifier in refreshByCollection() needs to be a registered syncronisation. It has to be registered before via addView()'

// Storage for ALL system-wide syncronisations
export const SyncronisationStore = []

// ===========================================================
// DENORMALIZED-VIEWS CLASS
// ===========================================================
export const DenormalizedViews = class DenormalizedViews {
  // ================================================
  // PUBLIC API (to be used from outside)

  static addView(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      sourceCollection: { type: Mongo.Collection },
      viewCollection: { type: Mongo.Collection },
      pick: { type: [String], optional: true },
      sync: { type: Object, blackbox: true },
      postSync: { type: Object, blackbox: true, optional: true },
    }).validate(options)

    const { identifier, sourceCollection, viewCollection, pick, sync, postSync } = options

    // Validate options
    // validate that identifier is NOT yet registered
    if (_.contains(_.pluck(SyncronisationStore, 'identifier'), identifier)) {
      throw new Error(`${ERROR_IDENTIFIERT_EXISTS}: ${identifier}`)
    }
    // validate that collections are NOT the same
    if (sourceCollection===viewCollection) {
      throw new Error(ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT)
    }
    if (_.isEmpty(sync)) {
      throw new Error(ERROR_SYNC_NEEDS_TO_HAVE_CONTENT)
    }
    if (_.find(SyncronisationStore, (store) => {
            return (store.sourceCollection===sourceCollection
              && store.viewCollection===viewCollection)
       })) {
      throw new Error(ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS)
    }
    // is valid? Register it
    debug(`addView from sourceCollection "${sourceCollection._name}" to "${viewCollection._name}"`)
    SyncronisationStore.push(options)

    // register hooks to sourceCollection
    // those hooks wil sync to viewCollection
    sourceCollection.after.insert(function(userId, doc) {
      debug(`${sourceCollection._name}.after.insert`)
      // fix for insert-hook
      // doc._id = doc._id.insertedIds[0]
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: options,
      })
      DenormalizedViews._executeDatabaseComand(() => {
        debug(`inserting doc with id ${doc._id}`)
        viewCollection.insert(doc)
      })
    })

    sourceCollection.after.update(function(userId, doc, fieldNames, modifier) {
      debug(`${sourceCollection._name}.after.update`)
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: options,
      })

      DenormalizedViews._executeDatabaseComand(() => {
        debug(`updating doc with id ${doc._id}`)
        viewCollection.update(doc._id, { $set: doc })
      })
    })

    sourceCollection.after.remove(function(userId, doc) {
      debug(`${sourceCollection._name}.after.remove`)
      DenormalizedViews._executeDatabaseComand(() => {
        debug(`removing doc with id ${doc._id}`)
        viewCollection.remove(doc._id)
      })
    })
  }

  static refreshByCollection(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      relatedCollection: { type: Mongo.Collection },
      refreshIds: { type: Function },
    }).validate(options)

    const { identifier, relatedCollection, refreshIds } = options

    // Validate
    const existingSyncronisation = DenormalizedViews._getExistingSyncronisation({ identifier })
    // validate that we have a valid identifier
    if (!existingSyncronisation) {
      throw new Error(ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID)
    }
    // validate that we have a valid collection assigned
    if (existingSyncronisation.sourceCollection===relatedCollection
      || existingSyncronisation.viewCollection===relatedCollection) {
      throw new Error(ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION)
    }

    debug(`setup refreshByCollection for identifier "${identifier}" and relatedCollection "${relatedCollection._name}"`)

    relatedCollection.after.insert(function(userId, doc) {
      debug(`relatedCollection ${relatedCollection._name}.after.insert`)
      // doc._id = doc._id.insertedIds[0]  // fix for insert-hook
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      } else {
        debug('no _ids received from refreshIds-function. So NO docs will be updated in "view"-collection')
      }
    })

    relatedCollection.after.update(function(userId, doc, fieldNames, modifier) {
      debug(`relatedCollection ${relatedCollection._name}.after.update`)
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      } else {
        debug('no _ids received from refreshIds-function. So NO docs will be updated in "view"-collection')
      }
    })

    // REMOVE hook
    // our aim is to always UPDATE the "view"-collection. P.e. if Author changes
    // his name or gets deleted than the "view"-collection needs to refresh.
    // Of course in this case the App itself would have to make sure that
    // before authorId is removed from sourceCollection
    relatedCollection.after.remove(function(userId, doc) {
      debug(`relatedCollection ${relatedCollection._name}.after.remove`)
      const ids = DenormalizedViews._validateAndCallRefreshIds({ doc, refreshIds, userId })
      if (ids && ids.length>0) {
        DenormalizedViews._updateIds({
          identifier,
          idsToRefresh: ids,
        })
      } else {
        debug('no _ids received from refreshIds-function. So NO docs will be updated in "view"-collection')
      }
    })
  }

  /**
   * Manually refresh a set of Ids in an syncronisation
   * for an given identifier.
   *
   * Use this in your App at places where a manual refresh is needed.
   *
   * @param  {Object} options [description]
   * @return {[type]}         [description]
   */
  static refreshManually(options = {}) {
    new SimpleSchema({
      identifier: { type: String },
      refreshIds: { type: [String] },
    }).validate(options)

    const { identifier, refreshIds } = options
    debug(`refreshManually for identifier ${identifier} and ids:`, refreshIds)

    if (refreshIds && refreshIds.length>0) {
      DenormalizedViews._updateIds({
        identifier,
        idsToRefresh: refreshIds,
      })
    }
  }

  /**
   * Do a TOTAL refresh of the target-collection,
   * meaning that ALL elements will get reloaded.
   *
   * In big collections this can bei
   *
   * @param  {[type]} identifier [description]
   * @return {[type]}            [description]
   */
  static refreshAll(identifier) {
    check(identifier, String)

    const existingSyncronisation = DenormalizedViews._getExistingSyncronisation({ identifier })
    debug(`refreshAll for collection "${existingSyncronisation.sourceCollection._name}"`)

    DenormalizedViews._executeDatabaseComand(() => {
      existingSyncronisation.viewCollection.remove({})
    })

    let ids = existingSyncronisation.sourceCollection.find({}, { fields: { '_id': 1 } }).fetch()
    ids = _.pluck(ids, '_id')

    for (const id of ids) {
      let doc = existingSyncronisation.sourceCollection.findOne(id)
      doc = DenormalizedViews._processDoc({
        doc,
        syncronisation: existingSyncronisation,
      })
      DenormalizedViews._executeDatabaseComand(() => {
        existingSyncronisation.viewCollection.insert(doc)
      })
    }
    debug(`${ids.length} docs in cache ${existingSyncronisation.viewCollection._name} were refreshed`)
  }

  /**
   * Process a given doc by "sync"- and "postSync" options
   *
   * @param  {Object} options [description]
   * @return {Object} doc that contains the collected data
   */
  static _processDoc(options = {}) {
    const { syncronisation, userId } = options
    const { viewCollection, sync, postSync, pick } = syncronisation
    let doc = options.doc
    // validate options
    // we cannot use SimpleSchema-validation here,
    // because we want to support use of superclasses
    // for docs in collection.
    if(!_.isObject(doc)) {
      throw new Error('options.doc needs to be an Object')
    }
    check(syncronisation, Object)
    check(userId, Match.Maybe(String))

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
        DenormalizedViews._unsetProperty({ property, _id: doc._id, collection: viewCollection })
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
          DenormalizedViews._unsetProperty({ property, _id: doc._id, collection: viewCollection })
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
    debug(`refreshing ids in "view"-collection "${existingSyncronisation.viewCollection._name}":`, idsToRefresh)

    for (const id of idsToRefresh) {
      let doc = existingSyncronisation.sourceCollection.findOne(id)
      doc = DenormalizedViews._processDoc({
        doc,
        userId,
        syncronisation: existingSyncronisation,
      })

      DenormalizedViews._executeDatabaseComand(() => {
        existingSyncronisation.viewCollection.update(doc._id, { $set: doc })
      })
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

    DenormalizedViews._executeDatabaseComand(() => {
      collection.update(_id, JSON.parse(`{ "$unset": { "${property}": 1 } }`))
    })
  }

  /**
   * Execute a database command. If ``DeferWriteAccess=true```,
   * wrap it into a ``Meteor.defer``, otherwise call it like any
   * other command and give it more priority.
   *
   * @param  {[type]} aFunction [description]
   * @return {[type]}          [description]
   */
  static _executeDatabaseComand(aFunction) {
    // we run database-updates ONLY on the server,
    // in order to relax the client, BUT need collections
    // to be known on the client,
    // p.e. for aldeed:tabular-support, so this is the
    // place to make sure, that we are on server.
    // In future we might add a "publishToClient" setting,
    // so that we can utilizy latency compensation.
    // For now this will do it.
    if (Meteor.isServer) {
      if (DenormalizedViews.DeferWriteAccess) {
        // good for mass-data
        Meteor.defer(() => {
          aFunction.call()
        })
      } else {
        // high speed
        aFunction.call()
      }
    }
  }
}
DenormalizedViews.Debug = false
DenormalizedViews.DeferWriteAccess = false

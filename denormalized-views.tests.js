/* eslint-env mocha */
/* eslint-disable func-names, prefer-arrow-callback */
import { _ } from 'underscore'
import { chai } from 'meteor/practicalmeteor:chai'
const expect = chai.expect
import { spies } from 'meteor/practicalmeteor:sinon'

import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { SimpleSchema } from 'meteor/aldeed:simple-schema'

import { DenormalizedViews, ERROR_IDENTIFIERT_EXISTS, ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT, ERROR_SYNC_NEEDS_TO_HAVE_CONTENT, ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS, ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION, ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID } from './denormalized-views.js'

DenormalizedViews.Debug = true

// empty class used for spies
const HookClass = class HookClass {
  static processHook(doc, userId) {
    // do something
  }
}

// FIXTURES
const Authors =  new Mongo.Collection('authors')
const Categories = new Mongo.Collection('categories')
const Comments = new Mongo.Collection('comments')
const Posts = new Mongo.Collection('posts')
const PostsDenormalizedView = new Mongo.Collection('postsdenormalizedview')
const Tags = new Mongo.Collection('tags')
const HookTestCollection = new Mongo.Collection('hooktestcollection')  // needed for testcase
Authors.attachSchema(new SimpleSchema({
  name: {
    type: String,
  },
}))
Comments.attachSchema(new SimpleSchema({
  text: {
    type: String,
  },
}))
Categories.attachSchema(new SimpleSchema({
  text: {
    type: String,
  },
  postId: {
    type: String,
  },
}))
Tags.attachSchema(new SimpleSchema({
  text: {
    type: String,
  },
  postIds: {
    type: [String],
  },
}))
Posts.attachSchema(new SimpleSchema({
  text: {
    type: String,
  },
  additionalText: {
    type: String,
  },
  authorId: {
    type: String,
  },
  commentIds: {
    type: [String],
    optional: true,
  },
  categoryId: {  // field to test insert-commant on refreshByCollection
    type: String,
    optional: true,
  },
}))

// Identifier allow you to add MULTIPLE view to one single collection
const DENORMALIZED_POST_COLLECTION = 'DENORMALIZED_POST_COLLECTION'
DenormalizedViews.addView({
  identifier: DENORMALIZED_POST_COLLECTION,
  sourceCollection: Posts,
  viewCollection: PostsDenormalizedView,
  filter(post) {
    // let's filter out post 5
    if (post.text!=='post 5') {
      return true
    }
    return false
  },
  postHook(doc, userId) {
    HookClass.processHook(doc, userId)
  },
  sync: {
    commentsCache: (post, userId) => {
      const comments = []
      for (const commentId of post.commentIds) {
        const comment = Comments.findOne(commentId)
        comments.push(comment)
      }
      return comments
    },
    authorCache: (post, userId) => {
      return Authors.findOne(post.authorId)
    },
    categoryCache: (post, userId) => {
      return Categories.findOne(post.categoryId)
    },
    tagsCache: (post, userId) => {
      return Tags.find({ postIds: post._id }).fetch()
    },
  },
  postSync: {
    wholeText: (post, userId) => {
      let authorText = ''
      if (post.authorCache) {
        authorText = post.authorCache.name
      }
      return `${post.text}, ${_.pluck(post.commentsCache, 'text').join(', ')}, ${authorText}`
    },
    numberOfComments: (post, userId) => {
      return post.commentsCache.length
    },
  },
})

DenormalizedViews.refreshByCollection({
  identifier: DENORMALIZED_POST_COLLECTION,
  relatedCollection: Authors,
  refreshIds: (author, authorPrevious, userId) => {
    expect(author).to.be.defined
    // return _id-array of posts that should be updated
    // return false, an empty array or undefined to NOT sync
    const posts = Posts.find({ authorId: author._id }).fetch()
    return _.pluck(posts, '_id')
  },
})

DenormalizedViews.refreshByCollection({
  identifier: DENORMALIZED_POST_COLLECTION,
  relatedCollection: Categories,
  refreshIds: (doc, docPrevious, userId) => {
    expect(doc).to.be.defined
    // return _id-array of posts that should be updated
    // return false, an empty array or undefined to NOT sync
    if (docPrevious) {
      // update
      return _.union(doc.postIds, docPrevious.postIds)
    } else {
      // insert | remove
      return doc.postIds
    }
  },
})

DenormalizedViews.refreshByCollection({
  identifier: DENORMALIZED_POST_COLLECTION,
  relatedCollection: Tags,
  refreshIds: (doc, docPrevious) => {
    if (docPrevious) {
      // update
      return _.union(doc.postIds, docPrevious.postIds)
    } else {
      // insert | remove
      return doc.postIds
    }
  },
})

const setupFixtures = () => {
  Authors.direct.remove({})
  Comments.direct.remove({})
  Posts.direct.remove({})
  PostsDenormalizedView.direct.remove({})
  Tags.direct.remove({})

  const authorId1 = Authors.insert({
    name: 'author 1',
  })
  const authorId2 = Authors.insert({
    name: 'author 2',
  })
  const authorId3 = Authors.insert({
    name: 'author 3',
  })
  const commentId1 = Comments.insert({
    text: 'comment 1',
  })
  const commentId2 = Comments.insert({
    text: 'comment 2',
  })
  const commentId3 = Comments.insert({
    text: 'comment 3',
  })
  const commentId4 = Comments.insert({
    text: 'comment 4',
  })
  const postId1 = Posts.insert({
    text: 'post 1',
    additionalText: 'additionalText post 1',
    authorId: authorId1,
    commentIds: [
      commentId1,
    ],
  })
  const postId2 = Posts.insert({
    text: 'post 2',
    additionalText: 'additionalText post 2',
    authorId: authorId1,
    commentIds: [
      commentId2,
    ],
  })
  const postId3 = Posts.insert({
    text: 'post 3',
    additionalText: 'additionalText post 3',
    authorId: authorId2,
    commentIds: [
    ],
  })
  const postId4 = Posts.insert({
    text: 'post 4',
    additionalText: 'additionalText post 4',
    authorId: authorId2,
    commentIds: [
      commentId4,
    ],
  })
  const tagId1 = Tags.insert({
    text: 'tag 1',
    postIds: [
      postId1,
      postId2,
    ],
  })

  return {
    commentId1,
    commentId2,
    commentId3,
    commentId4,
    authorId1,
    authorId2,
    authorId3,
    postId1,
    postId2,
    postId3,
    postId4,
    tagId1,
  }
}

const validateFixtures = (fixtures) => {
  expect(Authors.find().count()).to.equal(3)
  expect(Comments.find().count()).to.equal(4)
  expect(Posts.find().count()).to.equal(4)
  expect(PostsDenormalizedView.find().count()).to.equal(4)
  expect(Tags.find().count()).to.equal(1)
  const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
  const postDenormalized2 = PostsDenormalizedView.findOne(fixtures.postId2)
  const postDenormalized3 = PostsDenormalizedView.findOne(fixtures.postId3)
  const postDenormalized4 = PostsDenormalizedView.findOne(fixtures.postId4)

  expect(postDenormalized1._id).to.equal(fixtures.postId1)
  expect(postDenormalized1.text).to.equal('post 1')
  expect(postDenormalized1.commentsCache.length).to.equal(1)
  expect(postDenormalized1.commentsCache[0].text).to.equal('comment 1')
  expect(postDenormalized1.authorCache.name).to.equal('author 1')
  expect(postDenormalized1.tagsCache[0].text).to.equal('tag 1')
  expect(postDenormalized1.wholeText).to.equal('post 1, comment 1, author 1')
  expect(postDenormalized1.numberOfComments).to.equal(1)

  expect(postDenormalized2._id).to.equal(fixtures.postId2)
  expect(postDenormalized2.text).to.equal('post 2')
  expect(postDenormalized2.commentsCache.length).to.equal(1)
  expect(postDenormalized2.commentsCache[0].text).to.equal('comment 2')
  expect(postDenormalized2.authorCache.name).to.equal('author 1')
  expect(postDenormalized2.tagsCache[0].text).to.equal('tag 1')
  expect(postDenormalized2.wholeText).to.equal('post 2, comment 2, author 1')
  expect(postDenormalized2.numberOfComments).to.equal(1)

  expect(postDenormalized3._id).to.equal(fixtures.postId3)
  expect(postDenormalized3.text).to.equal('post 3')
  expect(postDenormalized3.commentsCache.length).to.equal(0)
  expect(postDenormalized3.authorCache.name).to.equal('author 2')
  expect(postDenormalized3.wholeText).to.equal('post 3, , author 2')
  expect(postDenormalized3.numberOfComments).to.equal(0)

  expect(postDenormalized4._id).to.equal(fixtures.postId4)
  expect(postDenormalized4.text).to.equal('post 4')
  expect(postDenormalized4.commentsCache.length).to.equal(1)
  expect(postDenormalized4.commentsCache[0].text).to.equal('comment 4')
  expect(postDenormalized4.authorCache.name).to.equal('author 2')
  expect(postDenormalized4.wholeText).to.equal('post 4, comment 4, author 2')
  expect(postDenormalized4.numberOfComments).to.equal(1)
}

// TESTS
if (Meteor.isServer) {
  describe('Foundation', function () {
    it('CollectionHooks-package allows us to instanciate multiple hook-functions. All defined hook-functions will be run.', function () {
      // define 2 hooks to test if they are both run
      HookTestCollection.after.insert(function (userId, doc) {
        HookTestCollection.update(doc._id, { $set: { insertHook1: 'insertHook1 was here' } })
      })
      HookTestCollection.after.insert(function (userId, doc) {
        HookTestCollection.update(doc._id, { $set: { insertHook2: 'insertHook2 was here' } })
      })
      // do an insert, to trigger the hooks
      const docId = HookTestCollection.insert({
        test: 'test insert',
      })
      // check
      const doc = HookTestCollection.findOne(docId)
      expect(doc.test).to.equal('test insert')
      expect(doc.insertHook1).to.equal('insertHook1 was here')
      expect(doc.insertHook2).to.equal('insertHook2 was here')
    })
  })
  describe('DenormalizedViews', function () {
    beforeEach(() => {
      Authors.remove({})
      Comments.remove({})
      Posts.remove({})
      PostsDenormalizedView.remove({})
      // SPIES
      spies.create('processHook', HookClass, 'processHook')
    })
    afterEach(() => {
      // SPIES
      spies.restoreAll()
    })

    it('.addView does validate options correctly', function () {
      expect(() => {
        DenormalizedViews.addView({
          identifier: DENORMALIZED_POST_COLLECTION,  // duplicate id
          sourceCollection: Posts,
          viewCollection: PostsDenormalizedView,
          sync: { },
        })
      }).to.throw(ERROR_IDENTIFIERT_EXISTS)

      expect(() => {
        DenormalizedViews.addView({
          identifier: 'unique',
          sourceCollection: Posts,  // same collection
          viewCollection: Posts,  // same collection
          sync: { },
        })
      }).to.throw(ERROR_SOURCE_AND_TARGET_COLLECTIONS_NEED_TO_BE_DIFFERENT)

      expect(() => {
        DenormalizedViews.addView({
          identifier: 'unique',
          sourceCollection: Posts,
          viewCollection: PostsDenormalizedView,
          sync: {
            // NO content
          },
        })
      }).to.throw(ERROR_SYNC_NEEDS_TO_HAVE_CONTENT)

      expect(() => {
        DenormalizedViews.addView({
          identifier: 'unique but combination already exists',
          sourceCollection: Posts,
          viewCollection: PostsDenormalizedView,
          sync: {
            authorCache: (post) => {
              return Authors.findOne(post.authorId)
            },
          },
        })
      }).to.throw(ERROR_SYNC_ALREADY_EXISTS_FOR_SOURCE_TARGET_COLLECTIONS)
    })

    it('.addView works as expected on INSERTS on viewCollection', function () {
      const fixtures = setupFixtures()  // inserts happen here
      validateFixtures(fixtures)  // inserts are validated in here
    })

    it('.addView works as expected on UPDATES on viewCollection', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      const updates = Posts.update(fixtures.postId1, { $set: { text: 'post 1 newtext', commentIds: [fixtures.commentId2, fixtures.commentId3], authorId: fixtures.authorId2 } })
      expect(updates).to.equal(1)
      expect(PostsDenormalizedView.find().count()).to.equal(4)
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1.text).to.equal('post 1 newtext')
      expect(postDenormalized1.commentsCache.length).to.equal(2)
      expect(postDenormalized1.commentsCache[0].text).to.equal('comment 2')
      expect(postDenormalized1.commentsCache[1].text).to.equal('comment 3')
      expect(postDenormalized1.authorCache.name).to.equal('author 2')
      expect(postDenormalized1.wholeText).to.equal('post 1 newtext, comment 2, comment 3, author 2')
      expect(postDenormalized1.numberOfComments).to.equal(2)
    })

    it('.addView works as expected on REMOVES on viewCollection', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      const updates = Posts.remove(fixtures.postId1)
      expect(updates).to.equal(1)
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1).to.be.undefined
    })

    it('.getView works as expected', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      expect(DenormalizedViews.getView(DENORMALIZED_POST_COLLECTION).identifier).to.equal(DENORMALIZED_POST_COLLECTION)
    })

    it('.refreshByCollection correctly validated options', function () {
      expect(() => {
        DenormalizedViews.refreshByCollection({
          identifier: 'unique does NOT exist yet',
          relatedCollection: Authors,  // wrong collection!!
          refreshIds: () => {},
        })
      }).to.throw(ERROR_REFRESH_BY_COLLECTION_NEEDS_TO_BE_ASSIGNED_TO_AN_EXISTING_ID)
      expect(() => {
        DenormalizedViews.refreshByCollection({
          identifier: DENORMALIZED_POST_COLLECTION,
          relatedCollection: Posts,  // wrong collection!!
          refreshIds: () => {},
        })
      }).to.throw(ERROR_REFRESH_BY_COLLECTION_CAN_NOT_BE_SET_TO_SOURCE_COLLECTION)
    })

    it('.refreshByCollection works as expected on updates on relatedCollection', function () {
      // NOTE: refreshByCollection() is set up above on Authors collection
      // a simple update on author should refresh the "view"-Collection
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      // UPDATE (has one relationship)
      Authors.update(fixtures.authorId1, { $set: { name: 'author 1 name NEW' } })
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1.authorCache.name).to.equal('author 1 name NEW')
      expect(postDenormalized1.wholeText).to.equal('post 1, comment 1, author 1 name NEW')

      // UPDATE (has multiple relationship)
      Tags.update(fixtures.tagId1, { $set: {
        postIds: [
          fixtures.postId1,
        ],
      } })
      const postDenormalized1_1 = PostsDenormalizedView.findOne(fixtures.postId1)
      const postDenormalized2_1 = PostsDenormalizedView.findOne(fixtures.postId2)
      expect(postDenormalized1_1.tagsCache.length).to.equal(1)
      expect(postDenormalized1_1.tagsCache[0].text).to.equal('tag 1')
      expect(postDenormalized2_1.tagsCache.length).to.equal(0)
    })

    it('.refreshByCollection works as expected on removes on relatedCollection', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      // REMOVE
      Authors.remove(fixtures.authorId1)
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1.authorCache).to.be.undefined
      expect(postDenormalized1.wholeText).to.equal('post 1, comment 1, ')
    })

    it('.refreshByCollection works as expected on inserts on relatedCollection', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      // this is a weird useCase for an insert-trigger, because in order
      // to keep data consistentand enable Posts "view-collection"
      // to load the correct data, we need to set Posts.categoryId anyway.
      // So this test does NOT really make sense as it does NOT test, how relatedCollection()
      // works on insert, except that it makes sure that NO errors are thrown.
      const categoryId1 = Categories.insert({ text: 'category 1', postId: fixtures.postId1 })
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1.categoryCache).to.be.undefined
      Posts.update(fixtures.postId1, { $set: { categoryId: categoryId1 } })
      const postDenormalized1_2 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1_2.categoryCache.text).to.equal('category 1')
    })

    it('.refreshManually works as expected', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      // NOTE: in our test-setting Comments are NOT automatically synced
      // to "view"-collection via ``refreshByCollection``,
      // so that we can test ``refreshManually()``
      Comments.update(fixtures.commentId1, { $set: { text: 'comment 1 new text' } })
      DenormalizedViews.refreshManually({
        identifier: DENORMALIZED_POST_COLLECTION,
        refreshIds: [fixtures.postId1]
      })
      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      expect(postDenormalized1.text).to.equal('post 1')
      expect(postDenormalized1.commentsCache.length).to.equal(1)
      expect(postDenormalized1.commentsCache[0].text).to.equal('comment 1 new text')
      expect(postDenormalized1.authorCache.name).to.equal('author 1')
      expect(postDenormalized1.wholeText).to.equal('post 1, comment 1 new text, author 1')
      expect(postDenormalized1.numberOfComments).to.equal(1)
    })

    it('.refreshAll works as expected', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)

      // NOTE: comments are NOT synced automatically, so in this test
      // we update their text and then check if the "view"-collection
      // contains the right data after ``refreshAll()``
      Comments.update(fixtures.commentId1, { $set: { text: 'comment 1 new text' } })
      Comments.update(fixtures.commentId2, { $set: { text: 'comment 2 new text' } })
      Comments.update(fixtures.commentId3, { $set: { text: 'comment 3 new text' } })
      Comments.update(fixtures.commentId4, { $set: { text: 'comment 4 new text' } })

      DenormalizedViews.refreshAll(DENORMALIZED_POST_COLLECTION)

      const postDenormalized1 = PostsDenormalizedView.findOne(fixtures.postId1)
      const postDenormalized2 = PostsDenormalizedView.findOne(fixtures.postId2)
      const postDenormalized3 = PostsDenormalizedView.findOne(fixtures.postId3)
      const postDenormalized4 = PostsDenormalizedView.findOne(fixtures.postId4)

      expect(postDenormalized1.commentsCache.length).to.equal(1)
      expect(postDenormalized1.commentsCache[0].text).to.equal('comment 1 new text')
      expect(postDenormalized2.commentsCache.length).to.equal(1)
      expect(postDenormalized2.commentsCache[0].text).to.equal('comment 2 new text')
      expect(postDenormalized3.commentsCache.length).to.equal(0)
      expect(postDenormalized4.commentsCache.length).to.equal(1)
      expect(postDenormalized4.commentsCache[0].text).to.equal('comment 4 new text')
    })

    it('filter-option works as expected', function () {
      const fixtures = setupFixtures()
      validateFixtures(fixtures)
      expect(PostsDenormalizedView.find().count()).to.equal(4)
      // TEST:
      // add 1 more post to test filter
      // INSERT
      // .. with text that is expected to be FILTERED
      const id = Posts.insert({
        text: 'post 5',  // to be FILTERED out
        additionalText: 'additionalText post 1',
        authorId: Authors.findOne()._id,  // random
        commentIds: [
          Comments.findOne()._id,  // random
        ],
      })
      expect(PostsDenormalizedView.find().count()).to.equal(4)
      // UPDATE
      // .. same text (expect to be filtered out)
      Posts.update(id, { $set: {
        text: 'post 5',  // to be FILTERED out
        additionalText: 'additionalText post 1 update',
      } })
      expect(PostsDenormalizedView.find().count()).to.equal(4)
      // UPDATE
      // .. different text (NOT to be filtered)
      Posts.update(id, { $set: {
        text: 'post 6',  // expect PASS
      } })
      expect(PostsDenormalizedView.find().count()).to.equal(5)
    })

    it('processHook-option works as expected on insert, update and remove', function () {
      const authorId1 = Authors.insert({
        name: 'author 1',
      })
      const commentId1 = Comments.insert({
        text: 'comment 1',
      })
      const id = Posts.insert({
        text: 'post 1',
        additionalText: 'additionalText post 1',
        authorId: authorId1,
        commentIds: [
          commentId1,
        ],
      })
      expect(spies.processHook).to.have.callCount(1)
      Posts.update(id, { $set: {
        text: 'post 1 update',
      } })
      expect(spies.processHook).to.have.callCount(2)
      Posts.remove(id)
      expect(spies.processHook).to.have.callCount(3)
    })
  })
}

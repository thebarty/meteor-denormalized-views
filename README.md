**THIS IS AN EARLY RELEASE CANDIDATE. ALL TESTS PASS, BUT WE ARE LOOKING FOR FEEDBACK ON THIS TO MAKE IT 100% PRODUCTION STABLE. PLEASE TRY IT OUT AND GIVE US FEEDBACK!!!**

# Denormalized Views for Meteor
*thebarty:denormalized-views*

A toolkit that helps you to create "read-only" denormalized mongo-"views" (collections), which are especially useful for search-able tables, or other read-heavy scenarios (*see "[Example Use-Case](#example-use-case)" for a quick overview*).

The resulting "view"-collection can then be used with tools like ``aldeed:tabular``, or ``easy:search`` to display and search related data.

Simply define how the data shall be collected based on a "source"-collection. Whenever a change happens in "source"-collection (insert | update | remove), the "view"-collection will automatically be refreshed. 

Additionally you can hookup "related"-collections to automatically refresh the "source"-collection or trigger manual refreshes (*if necessary at all*).


# Table of Contents
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Installation](#installation)
- [Example Use-Case](#example-use-case)
- [Setup by ``addSyncronisation()``](#setup-by-addsyncronisation)
  - [Denormalize via ``sync:``](#denormalize-via-sync)
  - [Create "joined search fields" via ``postSync:``](#create-joined-search-fields-via-postsync)
  - [Pick the fields you need via ``pick()``](#pick-the-fields-you-need-via-pick)
- [Staying in sync](#staying-in-sync)
  - [**Automatically** synchronize "related"-collections (``refreshByCollection()``)](#automatically-synchronize-related-collections-refreshbycollection)
  - [**Manually** refreshing **individual** docs (``refreshManually()``)](#manually-refreshing-individual-docs-refreshmanually)
  - [**Manually** refreshing the **whole** collection (``refreshAll()``)](#manually-refreshing-the-whole-collection-refreshall)
- [Debug mode ``DenormalizedViews.Debug = true``](#debug-mode-denormalizedviewsdebug--true)
- [Defer syncing via ``DenormalizedViews.DeferWriteAccess``](#defer-syncing-via-denormalizedviewsdeferwriteaccess)
- [A full example containing all options](#a-full-example-containing-all-options)
- [Open Todos](#open-todos)
- [How to contribute to this package](#how-to-contribute-to-this-package)
- [Research Resources](#research-resources)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


# Installation

In your Meteor app directory, enter:

```
$ meteor add thebarty:denormalized-views
```


# Example Use-Case

Let's say you have 3 collections:
 * Posts (relate to 1 author & multiple comments)
 * Comments (relate to 1 post)
 * Authors (relate to multiple posts)

![data schema](https://github.com/thebarty/meteor-denormalized-views/blob/master/docs/data-schema.jpg)

In your app you want to show a list of posts **with infos about their related authors and comments**. Additionally you want to give the user the option **to search** by the following:
- search the post-text (field "text" in collection "Posts")
- search the comment-text (field "text" in collection "Comments")
- search the author-name (field "name" in collection "Author")

![user interface](https://github.com/thebarty/meteor-denormalized-views/blob/master/docs/user-interface.jpg)

You know that ``aldeed:tabular`` is a great package to list a collection in the frontend. Although it can easily show joined collection thru a package like ``reywood:publish-composite``, it does NOT support search over joined collections. **Here is where ``denormalized-views`` comes into play**: simply create a denormalized "view"-collection and use it to display and search data thru tabular.


# Setup by ``addSyncronisation()``

**NOTE: The package API needs to be run on the server!** *The client will then receive new data via pub/sub*

Use ``addSyncronisation()`` to define how your "view"-collection collects its data. It all starts at the "source"-collection (p.e. Posts): **data of the "source"-collection will automatically be copied 1-to-1 to the "view"-collection** (= the "view"-collection). Scroll down to see the first code.

## Behind the scenes
The concept is that your "source"-collection is **writable**, while your "view"-collection is **read-only**. DO NOT write to your "view"-collection - otherwise data will get out of sync!

**The synchronization is "one way"** and will run anytime the "source"-collection receives an Mongo- ``insert``, ``update`` or ``remove``-command. The effected docs will then process via your ``sync:``- && ``postSync``-definitions and stored to the "view"-collection.

Of course the ``_id`` will be the same in both collections. A ``remove`` on the "source"-collection will remove the doc from "view"-collection.

## Denormalize via ``sync:``

Within the ``sync``-property you **extend the target document** and hand each new property a function to collect the denormalized data and return it. 

**Start by defining your synchronization:**

```js
const IDENTIFIER = 'identifier' // unique id

const PostsDenormalizedView = new Mongo.Collection('postsdenormalizedview')
DenormalizedViews.addSyncronisation({
  identifier: IDENTIFIER,
  sourceCollection: Posts,
  viewCollection: PostsDenormalizedView,
  sync: {
    // In here you extend the targetDoc:
    // Simply define a property and assign it a function. 
    // Collection the data within this function
    // and return it.
    // 
    // The function will be passed 2 parameters:
    //  1) the current doc of the "source"-Collection 
    //  2) the current userId (when available)
    authorCache: (post, userId) => {
      return Authors.findOne(post.authorId)
    },
    categoryCache: (post, userId) => {
      return Categories.findOne(post.categoryId)
    },
    commentsCache: (post, userId) => {
      const comments = []
      for (const commentId of post.commentIds) {
        const comment = Comments.findOne(commentId)
        comments.push(comment)
      }
      return comments
    },
  },
})
```

## Create "joined search fields" via ``postSync:``

There is also a ``postSync:`` property, which acts the same as ``sync:``, but is run **after** ``sync:`` has collected the data, meaning that the passed doc will already contain the new properties from ``sync:``. You can use ``postSync:`` to create joined search fields or get creative.

```js
	// ... continuing the example from above
  postSync: {
    // This will be called AFTER ``sync:`` has attached 
    // new data to the doc, so you can use this to create
    // joined search fields, or get creative.
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
```

## Pick the fields you need via ``pick()``

By default the whole doc from your "source"-collection will be copied to "view"-collection. If you want to **restrict** the fields being copied you can use the ``pick``-option:

```js
DenormalizedViews.addSyncronisation({
  identifier: IDENTIFIER,
  sourceCollection: Posts,
  viewCollection: PostsDenormalizedView,
  pick: ['text'],  // (optional) set to pick specific fields
  								 // from sourceCollection
  // continue with
  // ... sync:
  // ... postSync:
})
```


# Staying in sync

If within your app you only write to "source"-collection, that is all you have to do, because by setting up ``addSyncronisation`` you enabled the automatic synchronization between "source"-Collection and "view"-collection.

**BUT** changes made to other "related"-collections will potentially invalidate data within your "view"-collection. In our example that would happen when you update ``Authors.name``. *(p.e. ``PostsDenormalizedView.authorsCache.name`` will then contain the wrong old name)*

There are **2 options to keep the "view"-collection in sync with "related"-collection**:
 1. hook up the **"related"-collection** via ``refreshByCollection()`` and let this package to the rest
 2. do it **manually** via ``refreshManually(identifier)``

Start with option 1) and use option 2) if needed at all.

## **Automatically** synchronize "related"-collections (``refreshByCollection()``)

Setup a ``refreshByCollection()`` to automatically synchronize changes made to a "related"-collection. Your task in here is to tell the "view"-collection which _ids shall be refreshed:

Within the ``refreshIds``-parameter's function **return an array of ``_ids``**. Those _ids will then be refreshed within "view"-collection. The first parameter in this function gives you the current doc change in the "related"-collection. 

If you return false, undefined or null a refresh will NOT be triggered.

```js
DenormalizedViews.refreshByCollection({
  identifier: IDENTIFIER,
  relatedCollection: Authors,
  refreshIds: (author, userId) => {
  	// The first parameter is the current doc changed within
  	// the "related"-collection.
    // Return an array of _ids that should be updated in "view"-collection.
    // Returning false, an empty array or undefined, will simply 
    // not refresh anything.
    const posts = Posts.find({ authorId: author._id }).fetch()
    return _.pluck(posts, '_id')
  },
})
```


## **Manually** refreshing **individual** docs (``refreshManually()``)

There might be places where you want to manually refresh the "view"-collection, p.e. in a ``Meteor.method``. You can use ``refreshManually()`` to do so:

```js
// this is the manual way of doing it,
//  p.e. from a ``Meteor.method``
DenormalizedViews.refreshManually({
  identifier: IDENTIFIER, 
  refreshIds: [Mongo._id],  // _id-array of posts that should be updated
})
```


## **Manually** refreshing the **whole** collection (``refreshAll()``)

If you ever want to manually refresh the whole view collection, you can use ``refreshAll()``. 

**Note that this is the slowest option, because the whole table will be refreshed.**

```js
// simply pass the identifier
DenormalizedViews.refreshAll(IDENTIFIER)
```


# Debug mode ``DenormalizedViews.Debug = true``

```js
import { DenormalizedViews } from 'thebarty:denormalized-views'
// enable logs
DenormalizedViews.Debug = true
```


# Defer syncing via ``DenormalizedViews.DeferWriteAccess``

If you don't care about data being sync 100% real-time and want to relax the server, you can switch on ``DenormalizedViews.DeferWriteAccess = true``. This will wrap all ``insert-`` | ``updates``– | ``removes``-commands into a ``Meteor.defer()`` an make those writes run asynchronously in the background. Data will take a bit longer to be synced to the "view"-collections. By default this setting is switched off.

```js
import { DenormalizedViews } from 'thebarty:denormalized-views'
// enable Meteor.defer() for writes
DenormalizedViews.DeferWriteAccess = true
```


# A full example containing all options

```js
import { DenormalizedViews } from 'thebarty:denormalized-views'

const IDENTIFIER = 'identifier' // unique id
const PostsDenormalizedView = new Mongo.Collection('postsdenormalizedview')
DenormalizedViews.addSyncronisation({
  identifier: IDENTIFIER,  // unique id for synchronization
  sourceCollection: Posts,
  viewCollection: PostsDenormalizedView,
  pick: ['text'],  // (optional) 
  sync: {
    authorCache: (post, userId) => {
      return Authors.findOne(post.authorId)
    },
    categoryCache: (post, userId) => {
      return Categories.findOne(post.categoryId)
    },
    commentsCache: (post, userId) => {
      const comments = []
      for (const commentId of post.commentIds) {
        const comment = Comments.findOne(commentId)
        comments.push(comment)
      }
      return comments
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
```


# Open Todos

 * Receive feedback from the community
 * Find out, which minimal package requirement there are. *I have only tested this package with the meteor 1.3*. Maybe we can lower ``api.versionsFrom('1.3.5.1')`` in ``package.js`` to make it available for older projects?


# How to contribute to this package

Lets make this perfect and collaborate. This is how to set up your local testing environment:
 1. run "meteor create whatever; cd whatever; mkdir packages;"
 2. copy this package into the packages dir, p.e. "./whatever/packages/denormalized-views"
 3. run tests from the root (/whatever/.) of your project like ``meteor test-packages ./packages/denormalized-views/ --driver-package practicalmeteor:mocha``
 4. develop, write tests, and submit a pull request


# Research Resources

 * [1] https://themeteorchef.com/snippets/using-unblock-and-defer-in-methods/#tmc-when-to-use-unblock-vs-defer When to use Meteor.defer(). Inspiration our ``DenormalizedViews.DeferWriteAccess``-setting.

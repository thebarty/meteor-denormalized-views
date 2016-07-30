**THIS IS AN EARLY RELEASE CANDIDATE. ALL TESTS PASS, BUT WE ARE LOOKING FOR FEEDBACK ON THIS TO MAKE IT 100% PRODUCTION STABLE. PLEASE TRY IT OUT AND GIVE US FEEDBACK!!!**

# Denormalized Views for Meteor
*thebarty:denormalized-views*

A toolkit that helps you to create "readonly" denormalized mongo-"views" (collections), which are especially useful for searchable tables, or other read-heavy scenarios (*see "[Example Use-Case](#example-use-case)" for a quick overview*).

The resulting "view"-collection can then be used with tools like ``aldeed:tabular``, or ``easy:search`` to display and search related data.

Simply define how the data shall be collected based on a "source"-collection. Whenver a change happens in "source"-collection (insert | update | remove), the "view"-collection will automatically be refreshed. 

Additionally you can hookup "related"-collections to automatically refresh the "source"-collection or trigger manual refreshes (*if neccessary at all*).


# Table of Contents
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Installation](#installation)
- [Example Use-Case](#example-use-case)
- [Setup by ``addSyncronisation()``](#setup-by-addsyncronisation)
- [Staying in sync](#staying-in-sync)
  - [**Automatically** refresh by related collections (``refreshByCollection()``)](#automatically-refresh-by-related-collections-refreshbycollection)
  - [**Manually** refreshing **individual** docs (``refreshManually()``)](#manually-refreshing-individual-docs-refreshmanually)
  - [**Manually** refreshing the **whole** collection (``refreshAll()``)](#manually-refreshing-the-whole-collection-refreshall)
- [Debug mode ``DenormalizedViews.Debug = true``](#debug-mode-denormalizedviewsdebug--true)
- [Defer syncing via ``DenormalizedViews.DeferWriteAccess``](#defer-syncing-via-denormalizedviewsdeferwriteaccess)
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

![chained denormalizations](https://github.com/thebarty/meteor-denormalized-views/blob/master/docs/data-schema.jpg)

In your app you want to show a list of posts **with infos about their related authors and comments**. Additionally you want to give the user the option **to search** by the following:
- search the post-text (field "text" in collection "Posts")
- search the comment-text (field "text" in collection "Comments")
- search the author-name (field "name" in collection "Author")

![chained denormalizations](https://github.com/thebarty/meteor-denormalized-views/blob/master/docs/user-interface.jpg)

You know that ``aldeed:tabular`` is a great package to list a collection in the frontent. Altough it can easily show joined collection thru a package like ``reywood:publish-composite``, it does NOT support search over joined collections. **Here is where ``denormalized-views`` comes into play**: simply create a denormalized "view"-collection and use it to display and search data thru tabular.


# Setup by ``addSyncronisation()``

Use ``addSyncronisation()`` to define how your view-collection collects its data. It all starts at the "sourceCollection" (p.e. Posts) - data of the sourceCollection will be copied 1-to-1 to the targetCollection (= the view-collection). 

In the ``sync``-property you extend the target document and hand each new property a function to collect the denormalized data and return it. 

There is also a ``postSync`` property, which acts the same as ``sync``, but is run **after** ``sync`` has collected the data, meaning that the passed doc will already contain the collected data. You can use ``postSync`` to create joined search fields.

*Behing the scenes*
*The package will run this ``sync``-process anytime the sourceCollection receives an Mongo- ``insert``, ``update`` or ``remove``-command. ``insert``- and ``update``-commands will put the doc thru ``sync`` && ``postSync`` and transfer the resulting doc into targetCollection. Of course the ``_id`` will be the same in both collections. A ``remove`` will remove the doc from targetCollection.*


**Start by defining your syncronization:**

```js
const DENORMALIZED_POST_COLLECTION = 'DENORMALIZED_POST_COLLECTION'

DenormalizedViews.addSyncronisation({
  identifier: DENORMALIZED_POST_COLLECTION,  // unique id for syncronisation
  sourceCollection: Posts,
  targetCollection: PostsDenormalized,
  pick: ['text'],  // (optional) 
                   // If NOT set, all properties of the sourceCollection-doc will be synced to targetCollection. 
                   // If SET, only the specified fields will be picked.
  sync: {
    // in here you define how the root of each sourceCollection-doc
    // will be extended. Think like in "SimpleSchema": Define a property
    // and assign it a function. The first parameter will be assigned the
    // current sourceCollection-doc, the second argument contains the current
    // userId (when available). Use it to collect the denormalized data
    // and return it.
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
  },
  postSync: {
    // similar to ``sync`` with the difference, that it will be run AFTER
    // all ``sync``-properties have been loaded. The doc within the first 
    // parameter of the function will contain this data. This enables you
    // to created "joined"-fields and be creative...
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


# Staying in sync

If within your app you only write to ``sourceCollection``, that is all you have to do. 

BUT there will probably be places in your app, where you know that data within the view-collection gets invalidated (=out of sync) and you want to refresh it, p.e. when you update ``Authors.name``.

There are 2 options to refresh the view-collection:
 1. hook up the **related collection** via ``refreshByCollection()`` and let this package to the rest
 2. do it **manually** via ``refreshManually(ID)``


## **Automatically** refresh by related collections (``refreshByCollection()``)

If you know that the ``targetCollection`` will always need to refresh, whenever a related collection (p.e. Authors) changes, use the ``refreshByCollection()`` function to trigger it. 

Within the ``refreshIds``-parameters function it will pass you the doc (of the related-collection) and ask you to **return an array of ``Mongo refreshIds`` of the sourceCollection-docs that should be refreshed**. If you return false, undefined or null a refresh will NOT be triggered.

```js
DenormalizedViews.refreshByCollection({
  identifier: DENORMALIZED_POST_COLLECTION,
  triggerCollection: Authors,
  refreshIds: (author, userId) => {
    // return _id-array of posts that should be updated.
    // Returning false, an empty array or undefined, 
    // will simply not assign the property to the doc
    const posts = Posts.find({ authorId: author._id }).fetch()
    return _.pluck(posts, '_id')
  },
})
```


## **Manually** refreshing **individual** docs (``refreshManually()``)

There might be places where you want to manually refresh the view-colection, p.e. in a ``Meteor.method``. You can use ``refreshManually()`` to do so:

```js
// this is the manual way of doing it,
//  p.e. from a ``Meteor.method``
DenormalizedViews.refreshManually({
  identifier: DENORMALIZED_POST_COLLECTION, 
  refreshIds: [Mongo._id],  // _id-array of posts that shoudl be updated
})
```


## **Manually** refreshing the **whole** collection (``refreshAll()``)

If you ever want to manually refresh the whole view collection, you can use ``refreshAll()``. 

**Note that this is the slowest option, because the whole table will be refreshed.**

```js
// simply pass the identifier
DenormalizedViews.refreshAll(DENORMALIZED_POST_COLLECTION)
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

**WARNING: THIS IS WORK IN PROGRESS - THIS IS TOTALLY UNUSABLE RIGHT NOW!!!**
**WARNING: THIS IS WORK IN PROGRESS - THIS IS TOTALLY UNUSABLE RIGHT NOW!!!**

# Denormalized Views for Meteor
*thebarty:denormalized-views*

A toolkit that helps you to create "readonly" denormalized mongo-"views" (collections), which are especially useful for searchable UI-tables, or other read-heavy scenarios (*see "[Example Use-Case](#example-use-case)" for a quick overview*).

The resulting "view"-collection can then be used with tools like ``aldeed:tabular``, or ``easy:search`` to display and search related data.

Simply define how the data shall be collected based on a "source"-collection. Whenver a change happens in "source"-collection (insert | update | remove), the "view"-collection will automatically be refreshed. 

Additionally you can hookup "related"-collections to automatically refresh the "source"-collection or trigger manual refreshes (*if neccessary at all*).

# Table of Contents
<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Example Use-Case](#example-use-case)
- [Setup by ``addSyncronisation()``](#setup-by-addsyncronisation)
- [Staying in sync](#staying-in-sync)
  - [**Automatically** refresh by related collections (``refreshByCollection()``)](#automatically-refresh-by-related-collections-refreshbycollection)
  - [**Manually** refreshing **individual** docs (``refreshManually()``)](#manually-refreshing-individual-docs-refreshmanually)
  - [**Manually** refreshing the **whole** collection (``refreshAll()``)](#manually-refreshing-the-whole-collection-refreshall)
- [TODOS:](#todos)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


# Example Use-Case

Let's say you have 3 collections:
 * Posts (relate to 1 author PLUS multiple comments)
 * Comments (relate to 1 post)
 * Authors (relate to multiple posts)

![chained denormalizations](https://github.com/thebarty/meteor-denormalized-views/blob/master/docs/data-schema.jpg)

In your app you wnat to show a list of posts and give the user the option to search by the following:
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
    // current sourceCollection-doc. Use it to collect the denormalized data
    // and return it.
    commentCache: (post) => {
      const comments = []
      for (const commentId of post.commentIds) {
        const comment = Comments.findOne(commentId)
        comments.add(comment)
      }
      return comments
    },
    authorCache: (post) => {
      return Authors.findOne(post.authorId)
    },
  },
  postSync: {
    // similar to ``sync`` with the difference, that it will be run AFTER
    // all ``sync``-properties have been loaded. The doc within the first 
    // parameter of the function will contain this data. This enables you
    // to created "joined"-fields and be creative...
    wholeText: (post) => {
      return `${post.text}, ${_.puck(post.commentCache, 'text').join(', ')}, ${post.authorCache.name}`
    },
    numberOfComments: (post) => {
      return post.commentCache.length
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
  refreshIds: (doc) {
    // return _id-array of posts that should be updated
    // return false or undefined to NOT sync
    return Posts.find({})
  }
})
```


## **Manually** refreshing **individual** docs (``refreshManually()``)

There might be places where you want to manually refresh the view-colection, p.e. in a ``Meteor.method``. You can use ``refreshManually()`` to do so:

```js
// this is the manual way of doing it,
//  p.e. from a ``Meteor.method``
DenormalizedViews.refreshManually({
  identifier: DENORMALIZED_POST_COLLECTION, 
  refreshIds: [Mongo._id]  // _id-array of posts that shoudl be updated
})
```


## **Manually** refreshing the **whole** collection (``refreshAll()``)

If you ever want to manually refresh the whole view collection, you can use ``refreshAll()``. 

**Note that this is the slowest option, because the whole table will be refreshed.**

```js
DenormalizedViews.refreshAll(DENORMALIZED_POST_COLLECTION)
```

# TODOS:
 * write tests
 * implement
 * release

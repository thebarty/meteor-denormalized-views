# Changelog

# Table Of Content

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [0.0.9](#009)
- [0.0.8](#008)
- [0.0.7](#007)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->


# 0.0.10
  * quickfix for 0.0.9 which crashed in production due to wrong use of `Package.onUse()`

# 0.0.9
  * made `refreshAll()` call `postHook()` (if defined)
  * fix to add files ONLY to server
  * Added `getView()` as an easy way to get an existing configuration

# 0.0.8
  * added `filter(doc)`-option (optional) to `DenormalizedViews.addView`, which can be used to only create a doc in the "view"-collection, if it passes a filter (meaning if the function returns `true`).
  * added `postHook`-option (optional) to `DenormalizedViews.addView`, which you can pass a function that will be called after a successfull insert-/update-/remove- of the "view"-collection.

# 0.0.7
  * Enhanced ``refreshByCollection.refreshIds`` to pass previousDoc as a parameter. In a lot of useCases this is needed to get all affected _ids
  * throw ``Meteor.Error`` instead of pure ``Error``
  * when ``sync``- or ``postSync`` functions return ``0`` or ``[]`` the property will now be stored in the doc
  * added more tests

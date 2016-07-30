Package.describe({
  name: 'thebarty:denormalized-views',
  version: '0.0.1',
  summary: 'A toolkit that helps you to create "readonly" denormalized mongo-"views" (collections), which are especially useful for searchable tables, or other read-heavy scenarios',
  git: 'https://github.com/thebarty/meteor-denormalized-views',
  documentation: 'README.md'
});

Npm.depends({
  'underscore': '1.8.3',
  'underscore.string': '3.3.4',
})

Package.onUse(function(api) {
  api.versionsFrom('1.3.5.1');
  api.use([
    'check',
    'ecmascript',
    'aldeed:simple-schema',
    'matb33:collection-hooks',
  ])
  api.mainModule('denormalized-views.js');
});

Package.onTest(function(api) {
  api.use([
    'check',
    'ecmascript',
    'tinytest',
    'test-helpers',
    'ejson',
    'ordered-dict',
    'random',
    'deps',
    'minimongo',
    'aldeed:simple-schema',
    'aldeed:collection2@2.9.1',
    'matb33:collection-hooks',
    'practicalmeteor:mocha',
    'thebarty:denormalized-views',
  ])

  api.mainModule('denormalized-views.tests.js');
});

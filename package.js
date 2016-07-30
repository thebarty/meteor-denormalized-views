Package.describe({
  name: 'denormalized-views',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: '',
  // URL to the Git repository containing the source code for this package.
  git: '',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
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
  // You should also include any packages you need to use in the test code
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
    'denormalized-views',
  ])

  api.mainModule('denormalized-views.tests.js');
});

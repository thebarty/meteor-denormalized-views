import { DenormalizedViews } from './denormalized-views.js'

/**
 * [debug description]
 */
export const debug = function debug(message, object = undefined) {
  if (DenormalizedViews.Debug) {
    console.log(`[DenormalizedViews] ${message}`)
    if (object) {
      console.log(object)
    }
  }
}

/**
 * Extend Object by another object WITHOUT overwriting properties.
 * Thanks to http://stackoverflow.com/questions/20590177/merge-two-objects-without-override
 */
export const extend = function (target) {
  for(var i=1; i<arguments.length; ++i) {
    var from = arguments[i];
    if(typeof from !== 'object') continue;
    for(var j in from) {
      if(from.hasOwnProperty(j)) {
        target[j] = typeof from[j]==='object'
        ? extend({}, target[j], from[j])
        : from[j];
      }
    }
  }
  return target;
}

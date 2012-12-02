(function (module) {

  "use strict";

  var mongoose = require('mongoose');
  var Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId
  , CardSchema;

  CardSchema = new Schema({
    title: { type: String, default: 'untitled' }
  , status: { type: Boolean, default: true }
  , created: { type: Date, default: Date.now }
  , dueDate: { type: Date, default: Date.now }
  , order: Number
  , author: ObjectId
  });

  // virtual attributes
  CardSchema.virtual('timeLeft')
  .get(function() {
    return this.dueDate - Date.now
  });

  // model methods
  CardSchema.method('getOrder', function() {
	  return this.order;
  });

  module.exports = mongoose.model('Card', CardSchema);

}(module));
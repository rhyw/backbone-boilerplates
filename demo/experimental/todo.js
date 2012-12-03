$(function ($, _, Backbone, io){

  "use strict";

  var Todo, TodoList, Todos, TodoView, AppView, App, socket;

  socket = io.connect();

  // Todo Model
  // ----------
  
  Todo = Backbone.Model.extend({

    idAttribute: "_id",

    noIoBind: false,

    socket: socket,

    url: function (){
      return "/todo" + ((this.id) ? '/' + this.id : '');
    },

    defaults: function () {
      return {
        title: "empty todo...",
        order: Todos.nextOrder(),
        done: false
      };
    }

    initialize: function () {
      if (!this.get('title')) {
        this.set({"title": this.defaults.title});
      }
      // bind events
      this.on('serverChange', this.serverChange, this);
      this.on('serverDelete', this.modelDelete, this);
      this.on('modelCleanup', this.modelCleanup, this);
      if (!this.noIoBind) {
        this.ioBind('update', this.serverChange, this);
        this.ioBind('delete', this.serverDelete, this);
        this.ioBind('lock', this.serverLock, this);
        this.ioBind('unlock', this.serverUnlock, this);
      }
    },

    toggle: function () {
      this.save({done: !this.get("done")});
    },

    clear: function (options) {
      this.destroy(options);
      this.modelCleanup();
    },

    serverChange: function (data) {
      data.fromServer = true;
      this.set(data);
    },

    serverDelete: function (data) {
      if (typeof this.collection === 'object') {
        this.collection.remove(this);
      } else {
        this.trigger('remove', this);
      }
    },

    serverLock: function (success) {
      if (success) {
        this.locked = true;
      }
    },

    modelCleanup: function () {
      this.ioUnbindAll();
      return this;
    },

    locked: false,

    lock: function (options) {
      if (!this._locked) {
        options = options ? _.clone(options) : {};
        var model = this
          , success = options.success;
        options.success = function (resp, status, xhr) {
          model.locked = true;
          if (success) {
            success(model, resp);
          } else {
            model.trigger('lock', model, resp, options);
          }
        };
        options.error = Backbone.wrapError(options.error, model, options);
        return (this.sync || Backbone.sync).call(this, 'lock', this, options);
      }
    },

    unlock: function (options) {
      if (this.locked) {
        options = options ? _.clone(options) : {};
        var model = this
          , success = options.success;
        options.success = function (resp, status, xhr) {
          model._locked = false;
          if (success) {
            success(model, resp);
          } else {
            model.trigger('unlock', model, resp, options);
          }
        };
        options.error = Backbone.wrapError(options.error, model, options);
        return (this.sync || Backbone.sync).call(this, 'unlock', this, options);
      }
    }
  });

  TodoList = Backbone.Collection.extend({

    model: Todo,

    socket: socket,

    url: function () {
      return "/todo" + ((this.id) ? '/' + this.id : '');
    },

    initialize: function () {
      this.on('collectionCleanup', this.collectionCleanup, this);
      socket.on('/todo:create', this.serverCreate, this);
    },

    serverCreate: function (data) {
      if (data) {
        var todo = Todos.get(data._id);
        if (typeof todo === 'undefined') {
          Todos.add(data);
        } else {
          data.fromServer = true;
          todo.set(data);
        }
      }
    },

    collectionCleanup: function (callback) {
      this.ioUnbindALl();
      this.each(function (model) {
        model.modelCleanup();
      });
      return this;
    },
    
    done: function () {
      return this.filter(function (todo) { return todo.get('done'); });
    },

    remaining: function () {
      return this.without.apply(this, this.done());
    },

    nextOrder: function () {
      if (!this.length) { return 1; }
      return this.last().get('order') + 1;
    },

    comparator: function (todo) {
      return todo.get('order');
    }

  });

}(jQuery, _, Backbone, io));

$(function ($, _, Backbone, io) {

  "use strict";

  var Card, CardList, Cards, CardView, AppView, App, socket;

  socket = io.connect();

  // Todo Model
  // ----------

  // Our basic **Todo** model has `title`, `order`, and `done` attributes.
  Card = Backbone.Model.extend({

    // MongoDB uses _id as default primary key
    idAttribute: "_id",

    noIoBind: false,

    socket: socket,

    url: function () {
      return "/card" + ((this.id) ? '/' + this.id : '');
    },

    // Default attributes for the todo item.
    defaults: function () {
      return {
        title: "empty title...",
        order: Cards.nextOrder(),
        status: true
      };
    },

    // Ensure that each todo created has `title`.
    initialize: function () {
      if (!this.get("title")) {
        this.set({"title": this.defaults.title});
      }
      this.on('serverChange', this.serverChange, this);
      this.on('serverDelete', this.serverDelete, this);
      this.on('modelCleanup', this.modelCleanup, this);
      if (!this.noIoBind) {
        this.ioBind('update', this.serverChange, this);
        this.ioBind('delete', this.serverDelete, this);
        this.ioBind('lock', this.serverLock, this);
        this.ioBind('unlock', this.serverUnlock, this);
      }
    },

    // Toggle the `done` state of this todo item.
    toggle: function () {
      this.save({status: !this.get("status")});
    },

    // Remove this Todo and delete its view.
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
        //this.trigger('lock', this);
      }
    },

    serverUnlock: function (success) {
      if (success) {
        this.locked = false;
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

  // Todo Collection
  // ---------------

  CardList = Backbone.Collection.extend({

    // Reference to this collection's model.
    model: Card,

    socket: socket,

    // Returns the relative URL where the model's resource would be
    // located on the server. If your models are located somewhere else,
    // override this method with the correct logic. Generates URLs of the
    // form: "/[collection.url]/[id]", falling back to "/[urlRoot]/id" if
    // the model is not part of a collection.
    // Note that url may also be defined as a function.
    url: function () {
      return "/card" + ((this.id) ? '/' + this.id : '');
    },

    initialize: function () {
      this.on('collectionCleanup', this.collectionCleanup, this);
      socket.on('/card:create', this.serverCreate, this);
    },

    serverCreate: function (data) {
      if (data) {
        // make sure no duplicates, just in case
        var card = Cards.get(data._id);
        if (typeof card === 'undefined') {
          Cards.add(data);
        } else {
          data.fromServer = true;
          card.set(data);
        }
      }
    },

    collectionCleanup: function (callback) {
      this.ioUnbindAll();
      this.each(function (model) {
        model.modelCleanup();
      });
      return this;
    },

    // Filter down the list of all todo items that are finished.
    status: function () {
      return this.filter(function (card) { return card.get('status'); });
    },

    // Filter down the list to only todo items that are still not finished.
    remaining: function () {
      return this.without.apply(this, this.status());
    },

    // We keep the Todos in sequential order, despite being saved by unordered
    // GUID in the database. This generates the next order number for new items.
    nextOrder: function () {
      if (!this.length) { return 1; }
      return this.last().get('order') + 1;
    },

    // Cards are sorted by their original insertion order.
    comparator: function (card) {
      return card.get('order');
    }

  });

  // Create our global collection of **Todos**.
  Cards = new CardList();

  // Todo Item View
  // --------------

  // The DOM element for a todo item...
  CardView = Backbone.View.extend({

    tagName:  "p",

    // Cache the template function for a single item.
    template: _.template($('#card-entry').html()),

    // The DOM events specific to an item.
    events: {
      "click .toggle"   : "toggleDone",
      "click .add-card": "cardAdd",
      "dblclick .view"  : "edit",
      "click a.destroy" : "clear",
      "keypress .edit"  : "updateOnEnter",
      "blur .edit"      : "close"
    },

    // The TodoView listens for changes to its model, re-rendering. Since there's
    // a one-to-one correspondence between a **Todo** and a **TodoView** in this
    // app, we set a direct reference on the model for convenience.
    initialize: function () {
      this.model.on('change', this.render, this);
      this.model.on('lock', this.serverLock, this);
      this.model.on('unlock', this.serverUnlock, this);
      Cards.on('remove', this.serverDelete, this);
    },

    // Re-render the titles of the todo item.
    render: function () {
      this.$el.html(this.template(this.model.toJSON()));
      this.$el.toggleClass('done', this.model.get('status'));
      this.input = this.$('.edit');
      return this;
    },

    // Toggle the `"done"` state of the model.
    toggleDone: function () {
      this.model.toggle();
    },

    // Toggle the `"done"` state of the model.
    cardAdd: function () {
      console.log('click triggerd');
    },

    // Switch this view into `"editing"` mode, displaying the input field.
    edit: function () {
      if (!this.model.locked) {
        this.$el.addClass("editing");
        this.input.focus();
        this.model.lock();
      }
    },

    // Close the `"editing"` mode, saving changes to the todo.
    close: function () {
      var value = this.input.val();
      if (!value) {
        this.clear();
      }
      this.model.save({title: value});
      this.$el.removeClass("editing");
      this.model.unlock();
    },

    // If you hit `enter`, we're through editing the item.
    updateOnEnter: function (e) {
      if (e.keyCode === 13) {
        this.close();
      }
    },

    // Remove the item, destroy the model.
    clear: function () {
      if (!this.model.locked) {
        this.model.clear();
      }
    },

    serverDelete: function (data) {
      if (data.id === this.model.id) {
        this.model.clear({silent: true});
        this.$el.remove();
      }
    },

    serverLock: function () {
      if (!this.$el.hasClass("editing") && this.model.locked) {
        this.$el.addClass('locked');
        this.$('.toggle').attr('disabled', true);
      }
    },

    serverUnlock: function () {
      this.$el.removeClass('locked');
      this.$('.toggle').attr('disabled', false);
    }
  });

  // The Application
  // ---------------

  // Our overall **AppView** is the top-level piece of UI.
  AppView = Backbone.View.extend({

    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#content"),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "keypress #add-card":  "createOnEnter",
    },

    // At initialization we bind to the relevant events on the `Todos`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos.
    initialize: function (initalData) {

      this.input = this.$("#add-card");

      Cards.on('add', this.addOne, this);
      Cards.on('reset', this.addAll, this);
      Cards.on('all', this.render, this);

      this.footer = this.$("footer");
      this.main = $("#main");

      Cards.fetch({
        success: function (cards, models) {
          var data = initalData.card
            , locks = ((data && data.locks) ? data.locks : [])
            , model;
          _.each(locks, function (lock) {
            model = card.get(lock);
            if (model) {
              model.lock();
            }
          });
        }
      });
    },

    // Re-rendering the App just means refreshing the statistics -- the rest
    // of the app doesn't change.
    render: function () {
      var done = Cards.length,
        remaining = Cards.length;

      if (Cards.length) {
        this.main.show();
      } else {
        this.main.hide();
      }
    },

    addOne: function (card) {
      var view = new CardView({model: card});
      $("#card-list").append(view.render().el);
    },

    // If you hit return in the main input field, create new **Todo** model
    createOnEnter: function (e) {
      if (e.keyCode !== 13) { return; }
      if (!this.input.val()) { return; }

      var t = new Card({title: this.input.val()});
      t.save();

      this.input.val('');
    },

  });

  // Finally, we kick things off by creating the **App** on successful socket connection

  socket.emit('connect', ['card'], function (err, data) {
    if (err) {
      console.log('Unable to connect.');
    } else {
      App = new AppView(data);
    }
  });

}(jQuery, _, Backbone, io));
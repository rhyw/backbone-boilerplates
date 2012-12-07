$(function ($, _, Backbone, io) {

  "use strict";

  var Card, CardList, Cards, CardView, AppView, App, socket;

  socket = io.connect();

  Card = Backbone.Model.extend({

    idAttribute: "_id",
    noIoBind: false,
    socket: socket,
    url: function () {
      return "/card" + ((this.id) ? '/' + this.id : '');
    },

    defaults: function () {
      return {
        title: "empty title...",
        order: Cards.nextOrder(),
        status: true
      };
    },

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
      }
    },

    // Remove this Card and delete its view.
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

    modelCleanup: function () {
      this.ioUnbindAll();
      return this;
    },

    locked: false,

  });

  // Card Collection
  // ---------------

  CardList = Backbone.Collection.extend({

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
    nextOrder: function () {
      if (!this.length) { return 1; }
      return this.last().get('order') + 1;
    },

    comparator: function (card) {
      return card.get('order');
    }

  });

  Cards = new CardList();

  // Card Item View
  // --------------

  CardView = Backbone.View.extend({

    tagName:  "div",

    // Cache the template function for a single item.
    template: _.template($('#card-entry').html()),

    // The DOM events specific to an item.
    events: {
      "dblclick .view"  : "edit",
      "click a.destroy" : "clear",
      "keypress .edit"  : "updateOnEnter",
      "blur .edit"      : "close"
    },

    initialize: function () {
      this.model.on('change', this.render, this);
      Cards.on('remove', this.serverDelete, this);
    },

    render: function () {
      this.$el.html(this.template(this.model.toJSON()));
      this.input = this.$('.edit');
      return this;
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

    updateOnEnter: function (e) {
      if (e.keyCode === 13) {
        this.close();
      }
    },

    clear: function () {
      this.model.clear();
    },

    serverDelete: function (data) {
      if (data.id === this.model.id) {
        this.model.clear({silent: true});
        this.$el.remove();
      }
    },

  });

  // The Application
  // ---------------

  // Our overall **AppView** is the top-level piece of UI.
  AppView = Backbone.View.extend({

    // Instead of generating a new element, bind to the existing skeleton of
    // the App already present in the HTML.
    el: $("#content"),
    btnAddCard: $("#btn-add-card"),

    // Delegated events for creating new items, and clearing completed ones.
    events: {
      "click #add-card":  "createCard",
      "click .add-card": "showAddCard",
      "click .option-cancel": "cancelAddCard",
      "click .btn-submit": "addOne",
    },

    // At initialization we bind to the relevant events on the `Cards`
    // collection, when items are added or changed. Kick things off by
    // loading any preexisting todos.
    initialize: function (initalData) {

      this.input = this.$("#add-card-form");

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
      if (Cards.length) {
        this.main.show();
      } else {
        this.main.hide();
      }
    },

    showAddCard: function () {
      this.btnAddCard.hide();
      this.input.show();
    },

    cancelAddCard: function () {
      this.input.hide();
      this.btnAddCard.show();
    },

    addOne: function (card) {
      var view = new CardView({model: card});
      $("#card-list").append(view.render().el);
    },

    addAll: function () {
      Cards.each(this.addOne);
    },

    createCard: function () {
      var c = new Card({title: this.input.find('textarea').val()});
      c.save();
      // clear the textarea
      this.input.find('textarea').val('');
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

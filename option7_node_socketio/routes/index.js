(function (exports) {

  "use strict";

  exports.init = function (app) {

    app.get('/todo', function (req, res) {
      res.render('index', {
        'title': 'TodosMVC'
      });
    });

    app.get('/board', function (req, res) {
      res.render('board', {
        'title': 'Demo'
      });
    });

  };

}(exports));
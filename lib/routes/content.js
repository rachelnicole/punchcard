'use strict';

/*
 * @fileoverview Content system routing
 *
 */

const config = require('config');
const content = require('punchcard-content-types');
const multiparty = require('multiparty');
const multipart = require('connect-multiparty');
const uuid = require('uuid');
const _ = require('lodash');
const utils = require('../utils');
const db = require('../database');
const path = require('path');
const options = {
  autoFiles: true,
  uploadDir: path.join(__dirname, '../../public/uploads')
};

const multipartMiddleware = multipart(options);

/*
 * Content Route Resolution
 *
 * @param {object} application - Express Application
 * @returns {object} - Configured Express Application
 */
const routes = application => {
  return new Promise(resolve => {
    const app = application;
    const types = app.get('content-types');

    /*
     * Content Home Page
     */
    app.get(`/${config.content.base}`, (req, res) => {
      res.render('content/home', {
        content: {
          home: config.content.home,
          base: config.content.base,
          types,
        },
      });
    });

    /*
     * Individual Content Type Landing Page
     */
    app.get(`/${config.content.base}/:type`, (req, res, next) => {
      const type = utils.singleItem('id', req.params.type.toLowerCase(), types);

      if (type === false) {
        _.set(req.session, '404', {
          message: config.content.messages.missing.replace('%type', req.params.type),
          safe: `/${config.content.base}`,
        });

        return next();
      }

      res.render('content/landing', {
        content: {
          base: req.url,
          actions: config.content.actions,
          type,
        },
      });

      return true;
    });

    /*
     * Individual Content Type Add Page
     */
    app.get(`/${config.content.base}/:type/${config.content.actions.add}`, (req, res, next) => {
      const type = utils.singleItem('id', req.params.type.toLowerCase(), types);
      const errors = _.get(req.session, 'form.content.add.errors', {});
      let values = _.get(req.session, 'form.content.add.content', {});

      _.unset(req.session, 'form.content.add');

      values = utils.config(values);

      if (type === false) {
        _.set(req.session, '404', {
          message: config.content.messages.missing.replace('%type', req.params.type),
          safe: `/${config.content.base}`,
        });

        return next();
      }

      content.only(req.params.type, values, [type]).then(merged => {
        return content.form(merged, errors).then(form => {
          res.render('content/add', {
            form,
            action: req.url.replace(config.content.actions.add, config.content.actions.save),
            type,
          });
        });
      }).catch(e => {
        next(e);
      });

      return true;
    });

    /*
     *  Post to Content Type
     */
    app.post(`/${config.content.base}/:type/${config.content.actions.save}`, multipartMiddleware, (req, res, next) => {
      const type = utils.singleItem('id', req.params.type.toLowerCase(), types);

      if (type === false) {
        _.set(req.session, '404', {
          message: config.content.messages.missing.replace('%type', req.params.type),
          safe: `/${config.content.base}`,
        });

        return next();
      }

      // Validation
      const validated = content.form.validate(req.body, type);

      var form = new multiparty.Form();

      form.parse(req, function(err, fields, files) {
        console.log(req.files);
      });

      // utils.log(validated);
      //
      //
      if (validated === true) {
        // Sunrise/Sunsets
        const sunrise = utils.time.iso(req.body['sunrise-date'], req.body['sunrise-time'], 'America/New_York');
        const sunset = utils.time.iso(req.body['sunset-date'], req.body['sunset-time'], 'America/New_York');

        db(`content-type--${req.params.type.toLowerCase()}`).insert({
          id: uuid.v4(),
          language: 'us-en',
          sunrise,
          sunset,
          approval: 0,
          publishable: false,
          value: req.body,
          author: req.user.id,
        }).then(() => {
          res.redirect(`/${config.content.base}/${req.params.type}`);
        }).catch(e => {
          next(e);
        });
      }
      else {
        const referrer = req.get('Referrer');
        _.set(req.session, 'form.content.add', {
          errors: validated,
          content: req.body,
        });
        res.redirect(referrer);
      }

      return true;
    });

    resolve(app);
  });
};

module.exports = routes;

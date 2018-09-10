const http = require('http');
const fs = require("fs");
const path = require('path');
const request = require('request');
const config = require('../predix-config');

const { Pool, Client } = require('pg')

const dbconfig = {
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '',
  port: 5432,
}

const executeAnalytic = function(req, res) {
  console.log('executing...');
  console.log(req.body);
  //var assetName = req.body[0].assetname;
  //console.log('putFieldDataRequest', JSON.stringify(putFieldDataRequest));

  var options = {
    method: 'POST',
    url: config.analyticsCatalogUri + '/api/v1/catalog/analytics/ecf969bb-a6e9-466c-ae24-679384ba45d1/execution',
    headers: {
        'cache-control': 'no-cache',
        'Authorization' : req.headers['Authorization'],
        'content-type': 'application/json',
        'Predix-Zone-Id': config.predixZoneId
    },
    json: req.body
  };

  request(options, async function(err, response, body) {
    if (err) {
      console.error(err.message + err.stack);
      res.status(500).send(err.message);
    } else if (body && body.errorEvent && body.errorEvent.length > 0) {
      console.error('Error from analytics:', body.errorEvent[0]);
      res.status(500).send(body.errorEvent[0]);
    } else if (response.statusCode == 200 || response.statusCode == 204) {
      console.log('Response from analytics:', body);
      const sr_id = JSON.parse(body.inputData)['data']['sr_id']
      const client = new Client(dbconfig)
      await client.connect()
      // INSERT INTO SERVICE REQUEST TABLE
      console.log(`UPDATE service_request SET req_status='FOR REVIEW', predicted_rescodes='${body.result}' WHERE sr_id='${sr_id}';`)
      const updateSvcReq = await client.query(
        `UPDATE service_request SET req_status='FOR REVIEW', predicted_rescodes='${body.result}' WHERE sr_id='${sr_id}';`)
      console.log(updateSvcReq)
      await client.end()
    } else {
      console.error('ERROR executing analytics: ' + JSON.stringify(response));
      res.sendStatus(response.statusCode);
    }
  });

  res.send('executing...');
};

module.exports = {
  executeAnalytic: executeAnalytic
};

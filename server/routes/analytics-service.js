const http = require('http');
const fs = require("fs");
const path = require('path');
const request = require('request');
const config = require('../predix-config');

const { Pool, Client } = require('pg')

// const dbconfig = {
//   user: 'ud9umpepw3owqbwv',
//   host: 'db-2b43164b-fa6b-4720-84d1-557fb5a4ab7f.c7uxaqxgfov3.us-west-2.rds.amazonaws.com',
//   database: 'postgres',
//   password: '3le6mxqkjvpaj12yzl6wnen5f',
//   port: 5432,
// }

// FOR DEVELOPMENT
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
      // res.sendStatus(response.statusCode);
    }
  });

  res.send('executing...');
};

const runTopicDetector = async function(req, res) {
  console.log('calling topic detector...');
  // get all service request data from db
  const rescode = req.body.rescode
  const client = new Client(dbconfig)
  await client.connect()
  const pgres = await client.query(`SELECT * from service_request where final_rescode='${rescode}' LIMIT 25;`)
  const text = pgres.rows.map((row) => {
    return row['symptom'].replace(/Image:[\S]*/, " ");
  })
  await client.end()
  var options = {
    method: 'POST',
    url: config.analyticsCatalogUri + '/api/v1/catalog/analytics/686b0ab7-f124-4731-9861-b66227d2ee60/execution',
    headers: {
        'cache-control': 'no-cache',
        'Authorization' : req.headers['Authorization'],
        'content-type': 'application/json',
        'Predix-Zone-Id': config.predixZoneId
    },
    json: {
      "wotd_data": {
        "description": text
      },
      "parameters": {
              "n_topics" : 1,
              "n_words" : 10,
              "col_names":["description"],
              "top_n":1
          }
      }
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
      const topics = JSON.parse(body.result)['Topic'][0].split(' ')
      res.send(topics.map((topic, _) => {return {'rank': _+1,'topic': topic}}))
    } else {
      console.error('ERROR executing analytics: ' + JSON.stringify(response));
      // res.sendStatus(response.statusCode);
    }
  });

};

const runWordcloud = async function(req, res) {
  console.log('calling wordcloud...');
  const rescode = req.body.rescode
  const client = new Client(dbconfig)
  await client.connect()
  const pgres = await client.query(`SELECT * from service_request where final_rescode='${rescode}' LIMIT 25;`)
  const text = pgres.rows.map((row) => {
    return row['symptom'].replace(/Image:[\S]*/, " ");
  })
  await client.end()
  var options = {
    method: 'POST',
    url: config.analyticsCatalogUri + '/api/v1/catalog/analytics/37a38328-d235-42d3-9de4-3b9ccfed8f02/execution',
    headers: {
        'cache-control': 'no-cache',
        'Authorization' : req.headers['Authorization'],
        'content-type': 'application/json',
        'Predix-Zone-Id': config.predixZoneId
    },
    json: {
        "config": {"wordcloud": "True"},
        "data":   {"text" : text}
      }
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
      res.send(JSON.parse(body.result))
      // save word cloud base64
    } else {
      console.error('ERROR executing analytics: ' + JSON.stringify(response));
      // res.sendStatus(response.statusCode);
    }
  });
};

const runDocSimilarity = async function(req, res) {
  console.log('calling document similarity...');
  // get all service request data from db
  const client = new Client(dbconfig)
  await client.connect()
  const pgres = await client.query(`SELECT * from service_request where final_rescode='Adjust_gantry_tilt_speed';`)
  const text = pgres.rows.map((row) => {
    return row['symptom'].replace(/Image:[\S]*/, " ");
  })
  await client.end()
  var options = {
    method: 'POST',
    url: config.analyticsCatalogUri + '/api/v1/catalog/analytics/37a38328-d235-42d3-9de4-3b9ccfed8f02/execution',
    headers: {
        'cache-control': 'no-cache',
        'Authorization' : req.headers['Authorization'],
        'content-type': 'application/json',
        'Predix-Zone-Id': config.predixZoneId
    },
    json: {
        "config": {"wordcloud": "True"},
        "data":   {"text" : text}
      }
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
      //res.send(body)
      // save related resolution codes
    } else {
      console.error('ERROR executing analytics: ' + JSON.stringify(response));
      // res.sendStatus(response.statusCode);
    }
  });
};


module.exports = {
  executeAnalytic: executeAnalytic,
  runTopicDetector: runTopicDetector,
  runWordcloud: runWordcloud,
  runDocSimilarity: runDocSimilarity
};

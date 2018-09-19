/*******************************************************
The predix-webapp-starter Express web application includes these features:
  * routes to mock data files to demonstrate the UI
  * passport-predix-oauth for authentication, and a sample secure route
  * a proxy module for calling Predix services such as asset and time series
*******************************************************/
var http = require('http'); // needed to integrate with ws package for mock web socket server.
var express = require('express');
var jsonServer = require('json-server'); // used for mock api responses
var path = require('path');
var cookieParser = require('cookie-parser'); // used for session cookie
var bodyParser = require('body-parser');
var passport;  // only used if you have configured properties for UAA
var session = require('express-session');
var proxy = require('./routes/proxy'); // used when requesting data from real services.
// get config settings from local file or VCAPS env var in the cloud
var config = require('./predix-config');
// configure passport for authentication with UAA
var passportConfig = require('./passport-config');
// getting user information from UAA
var userInfo = require('./routes/user-info');
var app = express();
var httpServer = http.createServer(app);
var dataExchange = require('./routes/data-exchange');
var analyticsService = require('./routes/analytics-service');
var moment = require('moment');
var parse = require('csv-parse');
var fs = require("fs");
var SqlString = require('sqlstring');
// var assettemplatefile = "sample-data/predix-asset/compressor-2017-clone.json";

/**********************************************************************
       SETTING UP EXRESS SERVER
***********************************************************************/
app.set('trust proxy', 1);

// if running locally, we need to set up the proxy from local config file:
var node_env = process.env.node_env || 'development';
console.log('************ Environment: '+node_env+'******************');

if (node_env === 'development') {
  var devConfig = require('./localConfig.json')[node_env];
	proxy.setServiceConfig(config.buildVcapObjectFromLocalConfig(devConfig));
	proxy.setUaaConfig(devConfig);
} else {
  app.use(require('compression')()) // gzip compression
}

const { Pool, Client } = require('pg')

const dbconfig = require('./dbConfig.json')[node_env];

// Session Storage Configuration:
// *** Use this in-memory session store for development only. Use redis for prod. **
var sessionOptions = {
  secret: 'predixsample',
  name: 'cookie_name', // give a custom name for your cookie here
  maxAge: 30 * 60 * 1000,  // expire token after 30 min.
  proxy: true,
  resave: true,
  saveUninitialized: true
  // cookie: {secure: true} // secure cookie is preferred, but not possible in some clouds.
};
var redisCreds = config.getRedisCredentials();
if (redisCreds) {
  console.log('Using predix-cache for session store.');
  var RedisStore = require('connect-redis')(session);
  sessionOptions.store = new RedisStore({
    host: redisCreds.host,
    port: redisCreds.port,
    pass: redisCreds.password,
    ttl: 1800 // seconds = 30 min
  });
}
app.use(cookieParser('predixsample'));
app.use(session(sessionOptions));

console.log('UAA is configured?', config.isUaaConfigured());
if (config.isUaaConfigured()) {
	passport = passportConfig.configurePassportStrategy(config);
  app.use(passport.initialize());
  // Also use passport.session() middleware, to support persistent login sessions (recommended).
  app.use(passport.session());
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

/****************************************************************************
	SET UP EXPRESS ROUTES
*****************************************************************************/

app.get('/docs', require('./routes/docs')(config));

if (!config.isUaaConfigured()) {
  // no restrictions
  app.use(express.static(path.join(__dirname, process.env['base-dir'] ? process.env['base-dir'] : '../public')));

  // mock UAA routes
  app.get(['/login', '/logout'], function(req, res) {
    res.redirect('/');
  })
  app.get('/userinfo', function(req, res) {
      res.send({user_name: 'Sample User'});
  });
} else {
  //login route redirect to predix uaa login page
  app.get('/login',passport.authenticate('predix', {'scope': ''}), function(req, res) {
    // The request will be redirected to Predix for authentication, so this
    // function will not be called.
  });

  // route to fetch user info from UAA for use in the browser
  app.get('/userinfo', userInfo(config.uaaURL), function(req, res) {
    res.send(req.user.details);
  });

  // access real Predix services using this route.
  // the proxy will add UAA token and Predix Zone ID.
  app.use(['/predix-api', '/api'],
  	passport.authenticate('main', {
  		noredirect: true
  	}),
  	proxy.router);

  //callback route redirects to secure route after login
  app.get('/callback', passport.authenticate('predix', {
  	failureRedirect: '/'
  }), function(req, res) {
  	console.log('Redirecting to secure route...');
  	res.redirect('/');
    });

  // example of calling a custom microservice.
  // if (windServiceURL && windServiceURL.indexOf('https') === 0) {
  //   app.get('/windy/*', passport.authenticate('main', { noredirect: true}),
  //     // if calling a secure microservice, you can use this middleware to add a client token.
  //     // proxy.addClientTokenMiddleware,
  //     // or you can use this middleware to add a user access token.
  //     // proxy.addAccessTokenMiddleware,
  //     proxy.customProxyMiddleware('/windy', windServiceURL)
  //   );
  // }

  if (config.rmdDatasourceURL && config.rmdDatasourceURL.indexOf('https') === 0) {
    app.get('/api/datagrid/*',
        proxy.addClientTokenMiddleware,
        proxy.customProxyMiddleware('/api/datagrid', config.rmdDatasourceURL, '/services/experience/datasource/datagrid'));
  }

  if (config.dataExchangeURL && config.dataExchangeURL.indexOf('https') === 0) {
    app.post('/api/cloneasset', proxy.addClientTokenMiddleware, dataExchange.cloneAsset);

    app.post('/api/updateasset', proxy.addClientTokenMiddleware,
        proxy.customProxyMiddleware('/api/updateasset', config.dataExchangeURL, '/services/fdhrouter/fielddatahandler/putfielddata'));
  }

  if (config.analyticsCatalogUri && config.analyticsCatalogUri.indexOf('https') === 0) {
    console.log('can post to analytics');
  //   app.post('/api/predix-analytics-framework', proxy.addClientTokenMiddleware,
  //       proxy.customProxyMiddleware('/api/predix-analytics-framework', config.analyticsCatalogUri, '/api/v1/catalog/analytics/ecf969bb-a6e9-466c-ae24-679384ba45d1/execution'));
  // }
    app.post('/api/analytics', proxy.addClientTokenMiddleware, analyticsService.executeAnalytic)
    app.post('/api/topicdetector', proxy.addClientTokenMiddleware, analyticsService.runTopicDetector)
    app.post('/api/wordcloud', proxy.addClientTokenMiddleware, analyticsService.runWordcloud)
  }

  //Use this route to make the entire app secure.  This forces login for any path in the entire app.
  app.use('/', passport.authenticate('main', {
      noredirect: false // Redirect the user to the authentication page
    }),
    express.static(path.join(__dirname, process.env['base-dir'] ? process.env['base-dir'] : '../public'))
  );

  //Or you can follow this pattern to create secure routes,
  // if only some portions of the app are secure.
  app.get('/secure', passport.authenticate('main', {
    noredirect: true //Don't redirect the user to the authentication page, just show an error
    }), function(req, res) {
    console.log('Accessing the secure route');
    // modify this to send a secure.html file if desired.
    res.send('<h2>This is a sample secure route.</h2>');
  });

}

/*******************************************************
SET UP MOCK API ROUTES
*******************************************************/
// NOTE: these routes are added after the real API routes.
//  So, if you have configured asset, the real asset API will be used, not the mock API.
// Import route modules
var mockAssetRoutes = require('./routes/mock-asset.js')();
var mockTimeSeriesRouter = require('./routes/mock-time-series.js');
var mockRmdDatasourceRoutes = require('./routes/mock-rmd-datasource.js')();
// add mock API routes.  (Remove these before deploying to production.)
app.use(['/mock-api/predix-asset', '/api/predix-asset'], jsonServer.router(mockAssetRoutes));
app.use(['/mock-api/predix-timeseries', '/api/predix-timeseries'], mockTimeSeriesRouter);
app.use(['/mock-api/datagrid', '/api/datagrid'], jsonServer.router(mockRmdDatasourceRoutes));
require('./routes/mock-live-data.js')(httpServer);
// ***** END MOCK ROUTES *****

// route to return info for path-guide component.
app.use('/learningpaths', require('./routes/learning-paths')(config));

//logout route
app.get('/logout', function(req, res) {
	req.session.destroy();
	req.logout();
  passportConfig.reset(); //reset auth tokens
  res.redirect(config.uaaURL + '/logout?redirect=' + config.appURL);
});

app.get('/favicon.ico', function (req, res) {
	res.send('favicon.ico');
});

app.get('/config', function(req, res) {
  let title = "Prefix Diagnostic Tool";
  res.send({wsUrl: config.websocketServerURL, appHeader: title, dataExchangeEnabled: config.isDataExchangeConfigured(),
      timeSeriesOnly: config.timeSeriesOnly == "true" ? true : false});
});

app.post('/runmodel', async function(req, res) {
  res.send('hello');
  let error_list
  console.log(req.body.error_logs.split(/\r?\n/).length);
  if (req.body.error_logs == '') {
    error_list = []
  } else {
    error_list = req.body.error_logs.split(/\r?\n/).map((log) => {
      return {
        'error_code': log.split(',')[0].trim(),
        'error_timestamp': log.split(',')[1].trim()
      };
    });
  }

  console.log(error_list);

  const req_timestamp = moment().format()
  const client = new Client(dbconfig)
  await client.connect()
  // INSERT INTO SERVICE REQUEST TABLE
  const svcReq = await client.query(
    `INSERT INTO service_request(sr_id, symptom, req_status, req_timestamp) VALUES ('${req.body.sr_id}', '${req.body.symptom}', 'PREDICTING', '${req_timestamp}') RETURNING *;`)
  // INSERT INTO ERROR LOGS TABLE
  for (let error_log of error_list) {
    console.log(error_log)
    await client.query(
      `INSERT INTO error_log(error_code, error_timestamp, sr_id) VALUES ('${error_log.error_code}', '${error_log.error_timestamp}', '${req.body.sr_id}');`)
  }
  await client.end()
  res.send('created') // FIXME for directing user to newly created incident view
});


app.post('/final-rescode', async function(req, res) {
  console.log(req.body['sr_id'], req.body['final_rescode'])
  const client = new Client(dbconfig)
  await client.connect()
  const pgres = await client.query(`UPDATE service_request SET req_status='RESOLVED', final_rescode='${req.body.final_rescode}' WHERE sr_id='${req.body.sr_id}';`)
  await client.end()
  res.send('updated')
});

app.get('/issues', async function(req, res) {
  const client = new Client(dbconfig)
  await client.connect()
  let pgres = await client.query('SELECT * FROM SERVICE_REQUEST ORDER BY req_timestamp DESC LIMIT 30;')
  await client.end()
  res.send(pgres.rows);
})

app.get('/dashboard', async function(req, res)  {
  // FIXME add datetime range filter !!!
  const client = new Client(dbconfig)
  await client.connect()
  const totalIncidents = await client.query(`SELECT COUNT(*) FROM SERVICE_REQUEST;`)
  const numResolved = await client.query(`SELECT COUNT(*) FROM SERVICE_REQUEST WHERE req_status='RESOLVED';`)
  const totalErrorCodes = await client.query(`SELECT COUNT(*) FROM ERROR_LOG;`)
  const uniqueResCodes = await client.query(`SELECT final_rescode, COUNT(*) as counter FROM SERVICE_REQUEST WHERE final_rescode IS NOT NULL GROUP BY final_rescode ORDER BY counter DESC;`)
  const incidentsAgg = await client.query(`SELECT to_char(req_timestamp, 'YYYY-MM') as monthcounter, Count(*) as counter FROM SERVICE_REQUEST GROUP BY monthcounter ORDER BY monthcounter;`)
  const errorCodesAgg = await client.query(`SELECT to_char(error_timestamp, 'YYYY-MM') as monthcounter, Count(*) as counter FROM ERROR_LOG GROUP BY monthcounter ORDER BY monthcounter;`)
  const distinctCodesAgg = await client.query(`SELECT to_char(req_timestamp, 'YYYY-MM') as monthcounter, Count(DISTINCT(final_rescode)) as counter FROM SERVICE_REQUEST GROUP BY monthcounter ORDER BY monthcounter;`)
  await client.end()
  res.send({
      'totalIncidents': totalIncidents.rows[0].count,
      'numResolved': numResolved.rows[0].count,
      'totalErrorCodes': totalErrorCodes.rows[0].count,
      'uniqueResCodes': uniqueResCodes.rows,
      'incidentsAgg': incidentsAgg.rows,
      'errorCodesAgg': errorCodesAgg.rows,
      'distinctCodesAgg': distinctCodesAgg.rows
  });
})

app.get('/resolutions', async function(req, res)  {
  let rescode = req.query.q
  //const rescode = 'Perform_LFC_and_system_software_reload'
  const client = new Client(dbconfig)
  let uniqueResCodes
  let lastResolution
  let avgFrequency
  let errorCodes
  let srHeatmap
  let topics
  let relatedRescodes

  await client.connect()
  if (rescode) {
    uniqueResCodes = await client.query(`SELECT final_rescode as counter FROM SERVICE_REQUEST WHERE final_rescode IS NOT NULL GROUP BY final_rescode ORDER BY counter DESC;`)
    lastResolution = await client.query(`SELECT to_char(MAX(req_timestamp), 'DD-MM-YYYY') as last_resolution from SERVICE_REQUEST WHERE final_rescode='${rescode}';`)
    avgFrequency = await client.query(`SELECT DATE_PART('day', MAX(req_timestamp) - MIN(req_timestamp)) / COUNT(*) as freq from SERVICE_REQUEST WHERE final_rescode='${rescode}';`)
    errorCodes = await client.query(`SELECT el.error_code as error_code, COUNT(*) as counter FROM ERROR_LOG el, SERVICE_REQUEST sr WHERE sr.final_rescode='${rescode}' AND el.sr_id=sr.sr_id GROUP BY el.error_code ORDER BY counter DESC;`)
    srHeatmap = await client.query(`SELECT to_char(req_timestamp, 'YYYY') as year, to_char(req_timestamp, 'Mon') as month, COUNT(*) FROM service_request WHERE final_rescode='${rescode}' GROUP BY year, month ORDER BY year,month;`)
    let topicsRaw = await client.query(`SELECT top_topics from rescode_store WHERE rescode='${rescode}';`)
    let relatedRescodesRaw = await client.query(`SELECT related_rescodes from rescode_store WHERE rescode='${rescode}';`)
    topics = topicsRaw.rows[0]['top_topics'].split(' ').map((item, _) => {
      return {
        'rank': _+1,
        'topic': item
      };
    })
    let relatedRescodesObj = JSON.parse(relatedRescodesRaw.rows[0]['related_rescodes'])
    relatedRescodes = relatedRescodesObj['rescode'].map((rescode,_) => {
      const similarity = (parseFloat(relatedRescodesObj['similarity'][_]) * 100).toFixed(1)
      return {
        'rank': _+1,
        'rescode': rescode,
        'similarity': `${similarity}%`
      };
    })
  } else {
    uniqueResCodes = await client.query(`SELECT final_rescode as counter FROM SERVICE_REQUEST WHERE final_rescode IS NOT NULL GROUP BY final_rescode ORDER BY counter DESC;`)
    lastResolution = await client.query(`SELECT to_char(MAX(req_timestamp), 'DD-MM-YYYY') as last_resolution from SERVICE_REQUEST;`)
    avgFrequency = await client.query(`SELECT DATE_PART('day', MAX(req_timestamp) - MIN(req_timestamp)) / COUNT(*) as freq from SERVICE_REQUEST;`)
    errorCodes = await client.query(`SELECT el.error_code as error_code, COUNT(*) as counter FROM ERROR_LOG el, SERVICE_REQUEST sr WHERE el.sr_id=sr.sr_id GROUP BY el.error_code ORDER BY counter DESC;`)
    srHeatmap = await client.query(`SELECT to_char(req_timestamp, 'YYYY') as year, to_char(req_timestamp, 'Mon') as month, COUNT(*) FROM service_request GROUP BY year, month ORDER BY year,month;`)
    topics = []
    relatedRescodes = []
  }

  await client.end()
  res.send({
      'uniqueResCodes': uniqueResCodes.rows,
      'lastResolution': lastResolution.rows[0].last_resolution,
      'avgFrequency': avgFrequency.rows[0].freq,
      'errorCodes': errorCodes.rows,
      'srHeatmap': srHeatmap.rows,
      'topics': topics,
      'relatedRescodes': relatedRescodes
  });
})

app.get('/all-rescodes', async function(req, res) {
  const client = new Client(dbconfig)
  await client.connect()
  uniqueResCodes = await client.query(`SELECT final_rescode as counter FROM SERVICE_REQUEST WHERE final_rescode IS NOT NULL GROUP BY final_rescode ORDER BY counter DESC;`)
  await client.end()
  res.send(uniqueResCodes.rows.map((row) => {
    return row['counter'];
  }))
})

app.get('/errorlogs', async function(req, res) {
  var sr_id = req.query.sr_id
  console.log(req.query)
  const client = new Client(dbconfig)
  await client.connect()
  const errors = await client.query(`SELECT * FROM ERROR_LOG WHERE sr_id='${sr_id}' LIMIT 20;`)
  await client.end()
  res.send(errors.rows)
})

app.post('/loadsr', async function(req, res) {
  const client = new Client(dbconfig)
  await client.connect()
  const dirPath = 'server/sample-data/service-requests/'
  fs.readdir(dirPath, async function(err, items) {
    for (var i=0; i<items.length; i++) { // for each file to upload
        let rowStore = [[],[],[],[],[]]
        fs.createReadStream(dirPath + items[i])
          .pipe(parse({delimiter: ','}))
          .on('data', async function(csvrow) {
            rowStore[0].push(csvrow[0]);
            rowStore[1].push(csvrow[3]);
            rowStore[2].push(csvrow[2]);
            rowStore[3].push('RESOLVED');
            rowStore[4].push(csvrow[1]);
          })
          .on('end', async function() {
            const loadSR = await client.query('INSERT INTO service_request(sr_id, symptom, final_rescode, req_status, req_timestamp) SELECT * FROM UNNEST ($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamp[]);', rowStore)
          });
    }
  }).on('end', async function() {
    await client.end();
    res.send('done');
  });
})

app.post('/loadel', async function(req, res) {
  const client = new Client(dbconfig)
  await client.connect()
  const dirPath = 'server/sample-data/error-logs/'
  fs.readdir(dirPath, async function(err, items) {
    for (var i=0; i<items.length; i++) {
        console.log(items[i])
        let isHeader = true
        let rowStore = [[], [], []]
        fs.createReadStream(dirPath + items[i])
          .pipe(parse({delimiter: ','}))
          .on('data', async function(csvrow) {
              console.log(csvrow);
              if (isHeader) {
                isHeader = false
              } else {
                rowStore[0].push(csvrow[1]);
                rowStore[1].push(csvrow[2]);
                rowStore[2].push(csvrow[0]);
              }
          })
          .on('end', async function() {
            const errors = await client.query(`INSERT INTO error_log(error_code, error_timestamp, sr_id) SELECT * FROM UNNEST ($1::text[], $2::timestamp[], $3::text[]);`, rowStore)
            console.log(errors)
          });
    }
  }).on('end', async function() {
    await client.end()
    res.send('done')
  });
})

// app.post('/loadrc', async function(req, res) {
//   const client = new Client(dbconfig)
//   await client.connect()
//   const uniqueResCodes = await client.query(`SELECT final_rescode as counter FROM SERVICE_REQUEST WHERE final_rescode IS NOT NULL GROUP BY final_rescode ORDER BY counter DESC;`)
//   let sqlStr = 'INSERT INTO rescode_store(rescode) VALUES'
//   for (let rescode of uniqueResCodes.rows) {
//     sqlStr += ` ('${rescode.counter}'),`
//   }
//   sqlStr = sqlStr.substring(0, sqlStr.length-1) + ';'
//   console.log(sqlStr)
//   const pgres = await client.query(sqlStr)
//   await client.end()
//   res.send(uniqueResCodes)
// })

app.post('/load-analytics', async function(req, res) {
  // read csv from jupyter notebook analytics
  const client = new Client(dbconfig)
  await client.connect()
  const dirPath = 'server/sample-data/rescodes/'
  fs.readdir(dirPath, async function(err, items) {
    for (var i=0; i<items.length; i++) { // for each file to upload
        let rowStore = [[],[],[]]
        fs.createReadStream(dirPath + items[i])
          .pipe(parse({delimiter: ','}))
          .on('data', async function(csvrow) {
            rowStore[0].push(csvrow[0]);
            rowStore[1].push(csvrow[1]);
            rowStore[2].push(csvrow[2]);
          })
          .on('end', async function() {
            const loadSR = await client.query('INSERT INTO rescode_store(rescode, top_topics, related_rescodes) SELECT * FROM UNNEST ($1::text[], $2::text[], $3::text[]);', rowStore)
          });
    }
  }).on('end', async function() {
    await client.end();
    res.send('done');
  });
})


// Sample route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
//currently not being used as we are using passport-oauth2-middleware to check if
//token has expired
/*
function ensureAuthenticated(req, res, next) {
    if(req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}
*/

////// error handlers //////
// catch 404 and forward to error handler
app.use(function(err, req, res, next) {
  console.error(err.stack);
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});

// development error handler - prints stacktrace
if (node_env === 'development') {
	app.use(function(err, req, res, next) {
		if (!res.headersSent) {
			res.status(err.status || 500);
			res.send({
				message: err.message,
				error: err
			});
		}
	});
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
	if (!res.headersSent) {
		res.status(err.status || 500);
		res.send({
			message: err.message,
			error: {}
		});
	}
});

httpServer.listen(process.env.VCAP_APP_PORT || 5000, function () {
	console.log ('Server started on port: ' + httpServer.address().port);
});

module.exports = app;

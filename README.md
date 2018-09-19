# Prefix Diagnostic Tool

## Overview
The Prefix Diagnostic Tool ("Prefix") is a data analytics tool that aims to augment remote engineers in troubleshooting the <b>Optima CT660 machine</b>. It provides a simple and intuitive interface for the user to:<br>
1. Gain an overview of service incidents and track their statuses
2. Quickly troubleshoot with top resolution codes predicted by the model
3. Develop an intuition for troubleshooting by aggregating and visualizing data related to resolution codes

## Tech Stack
<i>Current Architecture</i>
![architecture](https://i.imgur.com/niZ26PN.png)
1. The frontend utilizes components from [Predix UI Components](https://www.predix-ui.com), which are built on Polymer.
2. The backend is implemented with a NodeJS/Express web server which integrates with Predix services like:
- User account & authentication (UAA)
- Database as a service (PostgreSQL)
- Predix logging
- Analytics framework
3. The analytics services (model) are hosted in another repository: []()

## Getting Started - User

### Setup
In order to log-in, get the username and password that is created with the UAA service bound to this app.

### Proposed Workflow
1. Datasource Tab: Add a service incident.
2. Incident Tab: View incident's predicted resolution codes.
3. Resolution Tab: Drill down on predicted codes to troubleshoot.
4. Incident Tab: Enter actual resolution code when resolved.
5. Dashboard Tab: Monitor incidents over time.

## Getting Started - Developer 

### Get the source code
Make a directory for your project.  Clone or download and extract the starter in that directory.
```
git clone https://github.com/tessav/ge-prefix.git  
cd ge-prefix
```

#### Install tools
If you don't have them already, you'll need node, bower and gulp to be installed globally on your machine.  

1. Install [node](https://nodejs.org/en/download/).  This includes npm - the node package manager.  
2. Install [bower](https://bower.io/) globally `npm install bower -g`  
3. Install [gulp](http://gulpjs.com/) globally `npm install gulp-cli -g`  

### Install the dependencies
Change directory into the new project you just cloned, then install dependencies.
```
npm install
bower install
```
### Running the app locally
The default gulp task will start a local web server.  Just run this command:
```
gulp
```
Browse to http://localhost:5000.

### Setup Database
Create a new database and create new tables using the following SQL:<br>
```
CREATE TABLE service_request (
  sr_id VARCHAR(32) PRIMARY KEY NOT NULL,
  symptom TEXT,
  final_rescode VARCHAR(100),
  predicted_rescodes JSON,
  req_status VARCHAR(48),
  req_timestamp TIMESTAMP
);
CREATE TABLE error_log (
  id SERIAL PRIMARY KEY NOT NULL,
  error_code TEXT,
  error_timestamp TIMESTAMP,
  sr_id VARCHAR(32) NOT NULL
);
CREATE TABLE rescode_store (
  rescode VARCHAR(100) PRIMARY KEY NOT NULL,
  top_topics TEXT,
  related_rescodes TEXT,
  wordcloud TEXT
);
```
Edit the dbconfig in `app.js` and `analytics-service.js` to your database credentials.

## Push to the Cloud

To push the application to a cloud environment:
1. Ensure you have the services used in the app already setup and bound to the app
1. Update corresponding fields in manifest.yml
2. Push to the cloud with `cf push`
3. Access the cloud deployment of the application by adding "https://" to the beginning of the URL, and loading that URL in a web browser.

## Support and Further Information

Ask questions or report a bug by creating an issue in this Github repository.


[![Analytics](https://ga-beacon.appspot.com/UA-82773213-1/predix-webapp-starter/readme?pixel)](https://github.com/PredixDev)


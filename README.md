# Prefix Diagnostic Tool

## What is the Prefix Diagnostic Tool?
The Prefix Diagnostic Tool ("Prefix") is a data analytics tool that aims to augment remote engineers in troubleshooting the <b>Optima CT660 machine</b>. It provides a simple and intuitive interface for the user to:<br>
1. Gain an overview of service incidents and track their statuses
2. Quickly troubleshoot with top resolution codes predicted by the model
3. Develop an intuition for troubleshooting by aggregating and visualizing data related to resolution codes


## Tech Stack
1. The frontend utilizes components from [Predix UI Components](https://www.predix-ui.com), which are built on Polymer.
2. The backend is implemented with a NodeJS/Express web server which integrates with Predix services like:
- User account & authentication (UAA)
- Database as a service (PostgreSQL)
- Predix logging
- Analytics framework
3. The analytics service (model) is hosted in another repository: []()

## Getting Started - User


## Getting Started - Developer 

### Get the source code
Make a directory for your project.  Clone or download and extract the starter in that directory.
```
git clone https://github.com/PredixDev/predix-webapp-starter.git  
cd predix-webapp-starter
```

### Install tools
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
## Running the app locally
The default gulp task will start a local web server.  Just run this command:
```
gulp
```
Browse to http://localhost:5000.
Initially, the app will use mock data for the views service, asset service, and time series service.
Later you can connect your app to real instances of these services.

## Running in Predix Cloud
With a few commands you can build a distribution version of the app, and deploy it to the cloud.

### Create a distribution version
Use gulp to create a distribution version of your app, which contains vulcanized files for more efficient serving.
You will need to run this command every time before you deploy to the Cloud.
```
gulp dist
```

## Push to the Cloud

### Pre-Requisites
Pushing (deploying) to a cloud environment requires knowledge of the commands involved and a valid user account with the environment.  GE uses Cloud Foundry for its cloud platform.  For information on Cloud Foundry, refer to this [link](http://docs.cloudfoundry.org/cf-cli/index.html).

### Steps
The simplest way to push the Starter application to a cloud environment is by modifying the default manifest file (manifest.yml) and using the **cf push** command, as follows:

1. Update manifest.yml

    Change the name field in your manifest.yml.  This is all you need to do!  Skip down to step 2, and you'll see the app running with mock data.
    If you want to connect to real Predix services, you'll need to do the following:
    Uncomment the services section, and change the names to match your service instances.
    Uncomment the two base64ClientCredential environment variables and enter the correct values for your UAA clients.
    The loginBase64ClientCredential should use authorization_code grant type to allow users to log in to your app. 
    The base64ClientCredential should use client_credentials grant type to allow your app to access back end services. 
    (app_client_id will have the scopes set up to access time series, asset, etc. login_client_id will not have any of those scopes.)

    ```
    ---
    applications:
      - name: my-predix-starter
        memory: 64M
        buildpack: nodejs_buildpack
        command: node server/app.js
    #services:
     # - <your-name>-secure-uaa-instance
     # - <your-name>-timeseries-instance
     # - <your-name>-asset-instance
    env:
        node_env: cloud
        uaa_service_label : predix-uaa
        # Add these values for authentication in the cloud
        #base64ClientCredential: dWFhLWNsaWVudC1pZDp1YWEtY2xpZW50LWlkLXNlY3JldA==
        #loginBase64ClientCredential: bG9naW5fY2xpZW50X2lkOnNlY3JldA==
    ```

2. Push to the cloud.

    ```
    cf push
    ```

3. Access the cloud deployment of your Starter application

  The output of the **cf push** command includes the URL to which your application was deployed.  Below is an example:

    ```
    Showing health and status for app my-predix-starter in org my-org / space dev as developer@gmail.com...
    OK
    
    requested state: started
    instances: 1/1
    usage: 128M x 1 instances
    urls: my-predix-starter.run.aws-usw02-pr.ice.predix.io
    last uploaded: Mon Apr 17 18:35:03 UTC 2017
    stack: cflinuxfs2
    buildpack: nodejs_buildpack

        state     since                    cpu    memory          disk          details
    #0   running   2017-04-17 11:35:40 AM   0.0%   63.5M of 128M   90.9M of 1G
    ```  

  Access your Starter application by adding "https://" to the beginning of the URL, and loading that URL in a web browser.

## Support and Further Information

Ask questions or report a bug by creating an issue in this Github repository.


[![Analytics](https://ga-beacon.appspot.com/UA-82773213-1/predix-webapp-starter/readme?pixel)](https://github.com/PredixDev)


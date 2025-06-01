# UniPort
Academic Progression Monitoring Web App

The purpose of the Academic Progression Monitoring web app is to provide a web-based platform to support users in monitoring student performance and progression. Student performance refers to the grades a student receives upon completing modules at a higher education institution. Student progression assesses whether students have met the academic requirements to progress to the next stage of study within their given pathway (programme of study).

## Features:
Role-based access control levels (administrators and students).

Administrator: Student, module, grade, and progression management. Bulk grade upload via CSV, automate progression decisions, generate and view reports, individual and group messaging

Student: View personal profile with limited editing of information, view grades for each module, view progression decision, messaging feature to contact Advisor of Studies

# How to Use

Both web app and API need to be running in order to work.

## Database:
Defaults:
DB_HOST='localhost'
DB_NAME='uniport'
DB_USER='root'
DB_PW='root'
DB_PORT='8889'

Web App uses localhost port 3000
API uses localhost port 4000

Connection details found here:
Web App: connection.js
API: /api/.env

## Build:
Node modules must be downloaded for both web app and API.

## Run:
Web app: 'npx nodemon' in project base directory
API: 'npx nodemon' in /api directory
Navigate to localhost:3000 in browser

## Login
Login details and passwords for all users can be found in database,
but here are two useful ones to demonstrate the app.

Admin:
User ID: AD888
Password: electric

Student:
User ID: 22-IFSY-0933003
Password: HLHG

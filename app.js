const express = require("express");
const app = express();
const PORT = 3000;
const path = require("path");
const connection = require("./connection.js");
const sessions = require('express-session');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');

const oneHour = 1000 * 60 * 60 * 1;

// sessions
app.use(sessions({
    secret: "myuni14385899",
    saveUninitialized: true,
    cookie: { maxAge: oneHour },
    resave: false
}));

//middleware
app.use(express.static(path.join(__dirname, './static')));
app.use(express.urlencoded({ extended: true })); // to parse data from forms

//config
app.set('view engine', 'ejs');

app.use('/', adminRoutes);
app.use('/', studentRoutes);

// Login Page
app.get("/", (req, res) => {
    res.render('index');
});

// Send to correct Portal (dashboard) from navbar
app.get("/dashboard", (req, res) => {
    if ((req.session.authen) && req.session.role === "admin") {
        res.redirect('adminportal');
    } else if ((req.session.authen) && req.session.role === "student") {
        res.redirect('studentportal');
    } else {
        res.send('access denied <a href=" / ">back</a>');
    }
});

// Authenticate Login Details, Begin Session, and go to Portal
app.post("/login", (req, res) => {

    const idData = req.body.id_field;
    const pData = req.body.password_field;

    // checks for admin type id, otherwise checks student
    if (idData.slice(0, 2).toUpperCase() === "AD") {

        let checkUser = `SELECT * FROM admins WHERE aId=? AND password=?`;

        connection.query(checkUser, [idData, pData], (err, admin) => {
            if (err) {
                console.error('Database error:', err);
                res.sendStatus(500);
            } else {
                if (admin.length > 0) {
                    req.session.authen = admin[0].admin_id;
                    req.session.role = 'admin';
                    res.render('adminportal', { myData: admin });
                } else {
                    res.send('No user found. <a href="/">Back</a>.');
                }
            }
        });

    } else { // Check for student credentials

        let checkUser = "SELECT * FROM students WHERE sId=? AND password=?";

        connection.query(checkUser, [idData, pData], (err, student) => {
            if (err) {
                console.error('Database error:', err);
                res.sendStatus(500);
            } else {
                if (student.length > 0) {
                    req.session.authen = student[0].student_id;
                    req.session.role = 'student';
                    res.render('studentportal', { myData: student });
                } else {
                    res.send('No user found. <a href="/">Back</a>.');
                }
            }
        });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 404 Route
app.use((req, res, next) => {
    res.status(404).render('404');
});

const server = app.listen(PORT, () => {
    console.log(`Web app started on port ${server.address().port}`);
});
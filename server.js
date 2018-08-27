const PORT = process.env.PORT || 80;
const express = require("express");
const Raven = require('raven');
const bodyParser = require("body-parser");
const admin = require("firebase-admin");
const sendgrid = require("@sendgrid/mail");
const path = require("path");

Raven.config('https://34374039f74a49e7ba4168c5c57ab557@sentry.io/1265543').install();
    
const app = express();

app.use(bodyParser.json());
app.use(Raven.requestHandler());
app.use(Raven.errorHandler());

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FBA_CREDENTIALS)),
    databaseURL: 'https://tcff-accounts.firebaseio.com'
});

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

const db = admin.firestore();
const settings = {timestampsInSnapshots: true};

db.settings(settings);

const verifyToken = (req, res, next) => {
    console.log("verifytoken middleware initiated");
    const userIdToken = req.body.token;
    if (userIdToken === undefined) {
        console.log("tokenVerifier failed: missing token");
        res.json({"statusCode":202,"message":"missing if token for verification"});
    }
    admin.auth().verifyIdToken(userIdToken).then((decodedToken) => {
        req.tcfAccountUid = decodedToken.uid;
        req.tcfAccountEmail = decodedToken.email;
        console.log("tokenVerifier passed, uid: "+decodedToken.uid);
        next();
    }).catch((error) => {
        console.log("tokenVerifier failed: "+error.message);
        res.json({"statusCode":406,"message":"ID token is invalid"});
    });
};

app.get('/error', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/error.html"));
});

app.get('/myaccount/mngt', (req, res) => {

    if (req.query.oobCode === undefined || req.query.continue_url === undefined || req.query.mode === undefined) res.redirect("/error");    
    if (req.query.mode === "resetPassword") {
        res.sendFile(path.join(__dirname, "/public/resetpassword.html"));
    } else if (req.query.mode === "verifyEmail") {
        res.sendFile(path.join(__dirname, "/public/verifyemail.html"));
    } else {
        res.redirect(302, "/error");
    }
});

app.get('/signin', (req, res) => {
    if (req.query.callback_uri === undefined) res.redirect(302, "/");
    res.sendFile(path.join(__dirname, "/public/signin.html"));
});

app.get('/signup', (req, res) => {
    if (req.query.callback_uri === undefined) res.redirect(302, "/");
    res.sendFile(path.join(__dirname, "/public/signup.html"));
});

app.get('/signin/confirm', (req, res) => {
    if (req.query.callback_uri === undefined) res.redirect(302, "/error");
    res.sendFile(path.join(__dirname, "/public/confirm.html"));
});

app.get('/forgotpassword', (req, res) => {
    if (req.query.callback_uri === undefined) res.redirect(302, "/error");
    res.sendFile(path.join(__dirname, "/public/forgotpassword.html"));
});

app.use("/api/verifytoken", verifyToken);

app.post("/api/verifytoken", (req, res) => {
    const uid = req.tcfAccountUid;
    res.json({"statusCode":202, "message":"token was successfully verified", "uid":uid});
});

app.use("/api/createtoken", verifyToken);

app.post("/api/createtoken", (req, res) => {
    db.collection(req.tcfAccountUid).doc("global").get().then((doc) => {
        if (!doc.exists) {
            res.json({"statusCode":404, "message":"global data document does not exist"});
        } else {
            console.log("global data document exists");
            admin.auth().createCustomToken(req.tcfAccountUid, doc.data().permissions).then((token) => {
                console.log("createCustomToken succeded");
                res.json({"statusCode":202, "message":"operation passed", "token":token});
            }).catch((error) => {
                console.log(error.message);
                res.json({"statusCode":505, "message":error.message});
            });     
        }
    }).catch((error) => {
        console.log(error.message);
        res.json({"statusCode":505, "message":error.message});
    });
});

app.use("/api/setclaims", verifyToken);

app.post("/api/setclaims", (req, res) => {
    const uid = req.tcfAccountUid;
    const currentPermissions = getCurrentPermissions(uid);
    if (currentPermissions === undefined) {
        res.json({"statusCode":404, "message":"permissions from global data not found"});
    }
    admin.auth().setCustomUserClaims(uid, currentPermissions).then(() => {
        console.log("setting new claims worked");
        res.json({"statusCode":202, "message":"operation passed", "permissions":currentPermissions});
    }).catch((error) => {
        console.log(error.message);
        res.json({"statusCode":505, "message":error.message});
    });
});

app.use("/api/email/:subject", verifyToken);

app.post("/api/email/:subject", (req, res) => {
    const subject = req.params.subject;
    const userEmail = req.tcfAccountEmail;
    const msg = {
        to: userEmail,
        from: 'jojo@tcff.co',
        subject: 'Hello world',
        text: 'Notification',
        html: '<p></p>'
    };
    if (subject === "newuser") {
        msg.templateId = "d-26b95c7042cc4294bc5c8df58f07de56";
    } else if (subject === "passwordreset") {
        msg.templateId = "d-6710abfa23f541f988ee3063f146ccf9";
    } else if (subject === "onconfirm") {
        msg.templateId = "d-81dadc44b09d44e4a577b1dd2127a0a6";
    } else {
        res.json({"statusCode":404, "message":"email subject: "+subject+" not found"});
    }
    try {
        sendgrid.send(msg);
    } catch (error) {
        console.log("sending email failed, error: "+toString(error));
        res.json({"statusCode":505, "message":toString(error)});
    }
    res.json({"statusCode":202, "message":"operation passed"});
});

app.listen(PORT, () => {
    console.log("Listening on port " + toString(PORT) + "...");
});


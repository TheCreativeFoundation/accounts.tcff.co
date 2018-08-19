const express = require("express");
const admin = require("firebase-admin");
const sendgrid = require("@sendgrid/mail");
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

const firebaseAdminKey = require("./tcf-accounts-firebase-key.json");
const app = express();

admin.initializeApp({
    credential: admin.credential.cert(firebaseAdminKey),
    databaseURL: 'https://tcff-accounts.firebaseio.com'
});

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

const db = admin.firestore();

var s3 = new AWS.S3();

const verifyToken = (req, res, next) => {
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

const checkForCallback = (req, res, next) => {
    if (req.query.callback_uri) {
        next();
    }
    res.redirect("/");
}

const getCurrentPermissions = (uid) => {
    const globalDataRef = db.collection(uid).doc("global");
    const globalData = globalDataRef.get().then((doc) => {
        if (!doc.exists) {
            console.log("/createtoken - globalData failed: document doesnt exist");
            return undefined;
        } else {
            console.log("/createtoken - globalData succeded: "+doc.data());
        }
    }).catch((error) => {
        console.log("/createtoken - globalData failed: "+error.message);
        return undefined;
    });
    return globalData.data().permissions;
};

const s3download = (bucketName, keyName, localDest) => {
    if (typeof localDest == 'undefined') {
        localDest = keyName;
    }
    let params = {
        Bucket: bucketName,
        Key: keyName
    };
    let file = fs.createWriteStream(localDest);
    return new Promise((resolve, reject) => {
        s3.getObject(params).createReadStream()
        .on('end', () => {
            return resolve();
        })
        .on('error', (error) => {
            return reject(error);
        }).pipe(file);
    });
};

s3download("tcf-accounts-key", "tcf-accounts-firebase-key.json", "tcf-accounts-firebase-key.json");

app.get('/error', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/error.html"))
});

app.get('/myaccount/mngt', (req, res) => {
    if (!(req.query.oobCode || req.query.continue_url || req.query.mode)) {
        const mode = req.query.mode;
        if (mode === "resetPassword") {
            res.sendFile(path.join(__dirname, "/public/resetpassword.html"));
        } else if (mode === "verifyEmail") {
            res.sendFile(path.join(__dirname, "/public/verifyemail.html"));
        } else {
            res.redirect("/error");
        }
    }
    res.redirect("/");
});

app.use(checkForCallback);

app.get('/signin', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/signin.html"));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/signup.html"));
});

app.get('/signin/confirm', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/confirm.html"));
});

app.get('/signin/forgotpassword', (req, res) => {
    res.sendFile(path.join(__dirname, "/public/forgotpassword.html"));
});

app.use(verifyToken);

app.post("/api/verifytoken", (req, res) => {
    const uid = req.tcfAccountUid;
    res.json({"statusCode":202, "message":"token was successfully verified", "uid":uid});
});

app.post("/api/createtoken", (req, res) => {
    const uid = req.tcfAccountUid;
    const currentPermissions = getCurrentPermissions(uid);
    if (currentPermissions === undefined) {
        res.json({"statusCode":404, "message":"permissions from global data not found"});
    }
    admin.auth().createCustomToken(uid, currentPermissions).then((token) => {
        console.log("createCustomToken succeded");
        res.json({"statusCode":202, "message":"operation passed", "token":toString(token)});
    }).catch((error) => {
        console.log("/createtoken - createCustomToken failed: "+error.message);
        res.json({"statusCode":505, "message":error.message});
    });
});

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

app.listen(80, () => {
    console.log("Listening on port 80...");
});


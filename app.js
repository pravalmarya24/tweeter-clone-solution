let express = require("express");
let { open } = require("sqlite");
let sqlite3 = require("sqlite3");
let bcrypt = require("bcrypt");
let path = require("path");
let jwt = require("jsonwebtoken");
let app = express();
app.use(express.json());

let dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

let initializeDBAndServer = async function () {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, function () {
      console.log("Server is Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

let convertUserTweetFeed = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.dateTime,
  };
};

let authenticationToken = async (request, response, next) => {
  let authorHeaders = request.headers["authorization"];
  let jwtToken;
  if (authorHeaders !== undefined) {
    jwtToken = authorHeaders.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My Secret Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// Register User API
app.post("/register/", async (request, response) => {
  try {
    let { username, password, name, gender } = request.body;
    let hashedPassword = await bcrypt.hash(password, 10);
    let postRegisterQuery = `
                SELECT 
                    *
                FROM 
                    user
                WHERE 
                    username = '${username}';`;
    let dbUser = await db.get(postRegisterQuery);
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else if (dbUser === undefined) {
      let postRegisterData = `
            INSERT INTO
                user (username,password,name,gender)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );`;
      let userData = await db.run(postRegisterData);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("User already exists");
    }
  } catch (error) {
    console.log(`error:${error.message}`);
  }
});

//Login User API
app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let postLoginQuery = `
                SELECT 
                    *
                FROM 
                    user
                WHERE 
                    username = '${username}';`;
  let dbUser = await db.get(postLoginQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let isMatchedPassword = await bcrypt.compare(password, dbUser.password);
    if (isMatchedPassword === true) {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "My Secret Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    try {
      let getUserQuery = `
        SELECT 
            user.username AS username,
            tweet.tweet AS tweet,
            tweet.date_time AS dateTime

        FROM
            user
        NATURAL JOIN tweet
        ORDER BY date_time DESC 
        LIMIT 4 ;`;
      let select = await db.all(getUserQuery);
      response.send(
        select.map((eachObject) => convertUserTweetFeed(eachObject))
      );
    } catch (e) {
      console.log(`Error: ${e.message}`);
    }
  }
);

app.get("/user/following/", authenticationToken, async (request, response) => {
  try {
    let getUserQuery = `
        SELECT 
            user.username AS name

        FROM
            user
        INNER JOIN follower ON user.user_id = follower.follower_id    
        
        ;`;
    let select = await db.all(getUserQuery);
    response.send(select);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
});

app.post("/user/tweets/", authenticationToken, async (request, response) => {
  try {
    let { tweet } = request.body;
    let postUserTweets = `
            UPDATE 
             tweet 
             SET 
                 tweet= '${tweet}'
             ;`;
    let newTweet = await db.run(postUserTweets);
    response.send("Created a Tweet");
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
});

app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    let { tweetId } = request.params;
    if (tweetId === tweetId) {
      let selectDeleteQuery = `
            DELETE 
            FROM 
               tweet
            WHERE tweet_id = ${tweetId}`;
      let deleteTweet = await db.run(selectDeleteQuery);
      response.send("Tweet Removed");
    } else {
      response.status(400);
      response.send("Invalid Request");
    }
  }
);

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  let { tweetId } = request.params;
  let getTweetById = `
        SELECT 
            tweet.tweet AS tweet,
            like.SUM(like_id) AS likes,
            reply.SUM(reply_id) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet
        INNER JOIN like ON tweet.user_id = like.user_id AND
        INNER JOIN reply ON reply.user_id = like.user_id
        WHERE 
            tweet_id = ${tweetId};
         
    `;
  let queryId = await db.get(getTweetById);
  response.send(queryId);
});

module.exports = app;

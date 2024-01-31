const keys = require('./keys');

// Express setup

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Postgres setup

const { Pool } = require('pg');
const pgClient = new Pool({
    user: keys.pgUser,
    host: keys.pgHost,
    database: keys.pgDatabase,
    password: keys.pgPassword,
    port: keys.pgPort,
    ssl: false
});

pgClient.on('error', () => console.log('Error in Postgres'));

pgClient.query('CREATE TABLE IF NOT EXISTS values (number INT)');

// Redis setup

const redis = require('redis');

const redisClient = redis.createClient({
    host: keys.redisHost,
    port: keys.redisPort,
    retry_strategy: () => 1000
});
const redisPublisher = redisClient.duplicate();

// Express route handlers

app.get('/', (req, res) => {
    res.send('Hi');
});

app.get('/values/all', async (req, res) => {
    console.log('/values/all server request received to retrieve all from values table in postgres');
    const values = await pgClient.query('SELECT * FROM values ORDER BY number');
    console.log('/values/all server request returned: ' + values.rows.map(({ number }) => number).join(', '));
    res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
    console.log('/values/current server request received to retrieve all hashed values from redis');
    redisClient.hgetall('values', (err, values) => {
        console.log('/values/current server request returned: ' + values.data);
        console.log('---');
        for (let key in values) {
            console.log(' [' + key + '] : ' + values[key]);
        }
        console.log('---');
        res.send(values);
    })
});

app.post('/values', async (req, res) => {
    const index = req.body.index;

    console.log('/values - this was posted: ' + parseInt(index));
    if (parseInt(index) > 40) {
        console.log('/values post was too high - rejecting');
        return res.status(422).send('Index too high');
    }

    const isNew = await pgClient.query('SELECT number FROM values WHERE number=$1', [index]);
    if (isNew.rowCount > 0) { // superfluous:  && isNew.rows[0].number == [index]) {
        console.log('/values posted already existed - neither adding to postgres nor calculating again');
        res.send({ working: false });
        return;
    }

    redisClient.hset('values', index, 'N/A');
    redisPublisher.publish('insert', index);
    pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);
    console.log('/values posted did not exist - adding to postgres and pushing insert message to redis to calculate');

    res.send({ working: true });
});

app.listen(5000, err => {
    console.log('Listening');
});
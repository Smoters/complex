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
    port: keys.pgPort//,
    //ssl: { rejectUnauthorized: false }
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
    const values = await pgClient.query('SELECT * FROM values ORDER BY number');
    res.send(values.rows);
});

app.get('/values/current', async (req, res) => {
    redisClient.hgetall('values', (err, values) => {
        res.send(values);
    })
});

app.post('/values', async (req, res) => {
    const index = req.body.index;

    if (parseInt(index) > 40) {
        return res.status(422).send('Index too high');
    }

    const isNew = await pgClient.query('SELECT number FROM values WHERE number=$1', [index]);
    if (isNew.rowCount > 0 ) { // superfluous:  && isNew.rows[0].number == [index]) {
        res.send({ working: false });
        return;
    }

    redisClient.hset('values', index, 'N/A');
    redisPublisher.publish('insert', index);
    pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);

    res.send({ working: true });
});

app.listen(5000, err => {
    console.log('Listening');
});
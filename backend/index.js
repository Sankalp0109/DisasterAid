const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

app.get('/', (req, res) => {
    res.send('DisasterAid Backend is running');
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);
router.get('/', userController.listUsers);
router.get('/:id', userController.getUserById);

module.exports = router;

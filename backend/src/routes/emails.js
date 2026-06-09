const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);
router.get('/', emailController.listEmails);
router.patch('/:id/read', emailController.markAsRead);

module.exports = router;

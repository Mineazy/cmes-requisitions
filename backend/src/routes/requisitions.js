const express = require('express');
const router = express.Router();
const requisitionController = require('../controllers/requisitionController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All routes require authentication
router.use(authenticateToken);

// List requisitions (with filters)
router.get('/', requisitionController.list);

// Get pending actions for current user
router.get('/pending', requisitionController.pendingActions);

// Get single requisition by ID
router.get('/:id', requisitionController.getById);

// Create new requisition (with optional file attachments)
router.post('/', requireRole('Requestor'), upload.array('attachments', 10), requisitionController.create);

// Edit requisition (Pending status only, Requestor only)
router.put('/:id', requireRole('Requestor'), requisitionController.edit);

// Process approval/rejection
router.post('/:id/approve', requisitionController.processApproval);

// Treasurer: Queue for disbursement
router.post('/:id/queue-disbursement', requireRole('Treasurer'), requisitionController.queueDisbursement);

// Treasurer: Disburse funds
router.post('/:id/disburse', requireRole('Treasurer'), requisitionController.disburse);

// Requestor: Submit receipts
router.post('/:id/submit-receipts', requireRole('Requestor'), requisitionController.submitReceipts);

// Treasurer: Clear requisition
router.post('/:id/clear', requireRole('Treasurer'), requisitionController.clearRequisition);

// Download attachment file
router.get('/:id/attachments/:fileId', requisitionController.downloadAttachment);

// Verify QR code
router.post('/verify-qr', requisitionController.verifyQR);

module.exports = router;

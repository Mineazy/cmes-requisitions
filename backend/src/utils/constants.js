const STATUS_FLOW = {
  'Admin': [
    'Pending',
    '1st Approver stage',
    '2nd Approver Stage',
    '3rd Approver Stage',
    'Final Approver',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Shop Use': [
    'Pending',
    '1st Approver stage',
    'Final Approver',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ]
};

const STATUS_ACTOR_MAP = {
  'Pending': '1st Approver',
  '1st Approver stage': '2nd Approver',
  '2nd Approver Stage': '3rd Approver',
  '3rd Approver Stage': 'Final Approver',
  'Final Approver': 'Treasurer',
  'Pending Disbursement': 'Treasurer',
  'Issued': 'Requestor',
  'Change Returned/Pending': 'Treasurer',
  'Change Cleared': 'Treasurer'
};

module.exports = { STATUS_FLOW, STATUS_ACTOR_MAP };

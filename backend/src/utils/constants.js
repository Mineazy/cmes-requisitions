const STATUS_FLOW = {
  'Admin': [
    'Pending',
    'Purchasing HOD',
    'Accounts HOD',
    'Director',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Shop Use': [
    'Pending',
    'Operations HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ]
};

const STATUS_ACTOR_MAP = {
  'Pending': 'Purchasing HOD',
  'Purchasing HOD': 'Accounts HOD',
  'Accounts HOD': 'Director',
  'Director': 'Treasurer',
  'Operations HOD': 'Treasurer',
  'Pending Disbursement': 'Treasurer',
  'Issued': 'Requestor',
  'Change Returned/Pending': 'Treasurer',
  'Change Cleared': 'Treasurer'
};

module.exports = { STATUS_FLOW, STATUS_ACTOR_MAP };

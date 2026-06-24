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
  ],
  'Returns Requisition': [
    'Pending',
    'Operations HOD',
    'Accounts HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ]
};

const STATUS_ACTOR_MAP = {
  'Admin': {
    'Pending': 'Purchasing HOD',
    'Purchasing HOD': 'Accounts HOD',
    'Accounts HOD': 'Director',
    'Director': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Shop Use': {
    'Pending': 'Operations HOD',
    'Operations HOD': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Returns Requisition': {
    'Pending': 'Operations HOD',
    'Operations HOD': 'Accounts HOD',
    'Accounts HOD': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  }
};

function getNextActorRole(status, type) {
  const typeMap = STATUS_ACTOR_MAP[type];
  if (!typeMap) return null;
  return typeMap[status] || null;
}

module.exports = { STATUS_FLOW, STATUS_ACTOR_MAP, getNextActorRole };

const STATUS_FLOW = {
  'Admin': [
    'Pending',
    'Finance HOD',
    'Director',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Shop Use': [
    'Pending',
    'Operations HOD',
    'Finance HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Returns Requisition': [
    'Pending',
    'Operations HOD',
    'Finance HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Purchasing': [
    'Pending',
    'Purchasing HOD',
    'Finance HOD',
    'Director',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ]
};

const STATUS_ACTOR_MAP = {
  'Admin': {
    'Pending': 'Finance HOD',
    'Finance HOD': 'Director',
    'Director': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Shop Use': {
    'Pending': 'Operations HOD',
    'Operations HOD': 'Finance HOD',
    'Finance HOD': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Returns Requisition': {
    'Pending': 'Operations HOD',
    'Operations HOD': 'Finance HOD',
    'Finance HOD': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Purchasing': {
    'Pending': 'Purchasing HOD',
    'Purchasing HOD': 'Finance HOD',
    'Finance HOD': 'Director',
    'Director': 'Treasurer',
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

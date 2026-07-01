const STATUS_FLOW = {
  'Admin': [
    'Pending',
    'Reviewer',
    'Purchasing HOD',
    'Finance HOD',
    'Director',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Shop Use': [
    'Pending',
    'Reviewer',
    'Operations HOD',
    'Finance HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ],
  'Returns Requisition': [
    'Pending',
    'Reviewer',
    'Operations HOD',
    'Finance HOD',
    'Pending Disbursement',
    'Issued',
    'Change Returned/Pending',
    'Change Cleared'
  ]
};

const STATUS_ACTOR_MAP = {
  'Admin': {
    'Pending': 'Reviewer',
    'Reviewer': 'Purchasing HOD',
    'Purchasing HOD': 'Finance HOD',
    'Finance HOD': 'Director',
    'Director': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Shop Use': {
    'Pending': 'Reviewer',
    'Reviewer': 'Operations HOD',
    'Operations HOD': 'Finance HOD',
    'Finance HOD': 'Treasurer',
    'Pending Disbursement': 'Treasurer',
    'Issued': 'Requestor',
    'Change Returned/Pending': 'Treasurer',
    'Change Cleared': 'Treasurer'
  },
  'Returns Requisition': {
    'Pending': 'Reviewer',
    'Reviewer': 'Operations HOD',
    'Operations HOD': 'Finance HOD',
    'Finance HOD': 'Treasurer',
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

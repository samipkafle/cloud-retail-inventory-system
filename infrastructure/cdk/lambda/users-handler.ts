import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({});

const userPoolId = process.env.USER_POOL_ID!;
const managerGroupName = process.env.MANAGER_GROUP_NAME || 'manager';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

// Mirrors inventory-handler.ts's manager gate. This endpoint manages who
// can sign in at all, so it's manager-only regardless of AUTH_ENABLED.
function isManager(event: any): boolean {
  const groupsClaim = event.requestContext?.authorizer?.claims?.['cognito:groups'];
  return typeof groupsClaim === 'string' && groupsClaim.includes(managerGroupName);
}

function forbidden() {
  return {
    statusCode: 403,
    headers: corsHeaders,
    body: JSON.stringify({ message: 'Only managers can manage staff accounts' }),
  };
}

function requireManager(event: any) {
  if (process.env.AUTH_ENABLED !== 'true') {
    return null;
  }
  return isManager(event) ? null : forbidden();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /users — lists every account and whether it's in the manager group.
// Two calls total (not one ListUsers call per account) regardless of how
// many accounts exist.
async function listUsers() {
  const [usersResult, managersResult] = await Promise.all([
    client.send(new ListUsersCommand({ UserPoolId: userPoolId })),
    client.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: managerGroupName })),
  ]);

  const managerUsernames = new Set((managersResult.Users || []).map((user) => user.Username));

  const users = (usersResult.Users || []).map((user) => {
    const email = user.Attributes?.find((attr) => attr.Name === 'email')?.Value || '';
    return {
      username: user.Username,
      email,
      status: user.UserStatus,
      enabled: user.Enabled,
      role: managerUsernames.has(user.Username) ? 'manager' : 'staff',
      createdAt: user.UserCreateDate?.toISOString() || '',
    };
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(users),
  };
}

// POST /users — creates a new Cognito account. Cognito auto-generates the
// temporary password and emails it directly to the new user (built-in
// email delivery, no SES setup needed) — the manager creating the account
// never sees or handles the password, matching how a real onboarding flow
// should work rather than passing credentials out of band.
async function createUser(event: any) {
  let body: Record<string, any>;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_error) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Request body must be valid JSON' }),
    };
  }

  const email = String(body.email || '').trim().toLowerCase();
  const role = body.role === 'manager' ? 'manager' : body.role === 'staff' ? 'staff' : null;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'A valid email address is required' }),
    };
  }
  if (!role) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'role must be "manager" or "staff"' }),
    };
  }

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
      })
    );
  } catch (error: any) {
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'An account with that email already exists' }),
      };
    }
    throw error;
  }

  if (role === 'manager') {
    await client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: managerGroupName,
      })
    );
  }

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify({
      message: 'Account created — a temporary password has been emailed to the user',
      email,
      role,
    }),
  };
}

export const handler = async (event: any) => {
  try {
    const authError = requireManager(event);
    if (authError) {
      return authError;
    }

    if (event.httpMethod === 'GET') return await listUsers();
    if (event.httpMethod === 'POST') return await createUser(event);

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};

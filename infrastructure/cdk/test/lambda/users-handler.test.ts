import { mockClient } from 'aws-sdk-client-mock';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { handler } from '../../lambda/users-handler';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

function withManagerClaims(overrides: Record<string, any> = {}) {
  return {
    requestContext: {
      authorizer: { claims: { 'cognito:groups': '[manager]' } },
    },
    ...overrides,
  };
}

function withStaffClaims(overrides: Record<string, any> = {}) {
  return {
    requestContext: {
      authorizer: { claims: { 'cognito:groups': '[staff]' } },
    },
    ...overrides,
  };
}

beforeEach(() => {
  cognitoMock.reset();
});

describe('manager gate', () => {
  it('rejects a non-manager on GET', async () => {
    const response = await handler({ httpMethod: 'GET', ...withStaffClaims() });
    expect(response.statusCode).toBe(403);
    expect(cognitoMock.calls()).toHaveLength(0);
  });

  it('rejects a non-manager on POST', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'new@greenleaf.demo', role: 'staff' }),
      ...withStaffClaims(),
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejects a request with no group claims at all', async () => {
    const response = await handler({ httpMethod: 'GET' });
    expect(response.statusCode).toBe(403);
  });
});

describe('POST /users validation', () => {
  it('rejects a missing email', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ role: 'staff' }),
      ...withManagerClaims(),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'not-an-email', role: 'staff' }),
      ...withManagerClaims(),
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an invalid role', async () => {
    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'new@greenleaf.demo', role: 'admin' }),
      ...withManagerClaims(),
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 409 when the account already exists', async () => {
    const conflict = new Error('exists');
    conflict.name = 'UsernameExistsException';
    cognitoMock.on(AdminCreateUserCommand).rejects(conflict);

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'existing@greenleaf.demo', role: 'staff' }),
      ...withManagerClaims(),
    });
    expect(response.statusCode).toBe(409);
  });
});

describe('POST /users success path', () => {
  it('creates a staff account without adding it to the manager group', async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'Staff@GreenLeaf.demo', role: 'staff' }),
      ...withManagerClaims(),
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(201);
    expect(body.email).toBe('staff@greenleaf.demo'); // lowercased
    expect(cognitoMock.commandCalls(AdminAddUserToGroupCommand)).toHaveLength(0);
  });

  it('creates a manager account and adds it to the manager group', async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});
    cognitoMock.on(AdminAddUserToGroupCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'newmanager@greenleaf.demo', role: 'manager' }),
      ...withManagerClaims(),
    });

    expect(response.statusCode).toBe(201);
    const groupCall = cognitoMock.commandCalls(AdminAddUserToGroupCommand)[0];
    expect(groupCall.args[0].input.GroupName).toBe('manager');
  });

  it('never returns a password value — only email and role', async () => {
    cognitoMock.on(AdminCreateUserCommand).resolves({});

    const response = await handler({
      httpMethod: 'POST',
      body: JSON.stringify({ email: 'new@greenleaf.demo', role: 'staff' }),
      ...withManagerClaims(),
    });
    const body = JSON.parse(response.body);

    expect(Object.keys(body).sort()).toEqual(['email', 'message', 'role']);
    expect(cognitoMock.commandCalls(AdminCreateUserCommand)[0].args[0].input.TemporaryPassword).toBeUndefined();
  });
});

describe('GET /users', () => {
  it('marks accounts in the manager group and leaves everyone else as staff', async () => {
    cognitoMock.on(ListUsersCommand).resolves({
      Users: [
        {
          Username: 'manager@greenleaf.demo',
          UserStatus: 'CONFIRMED',
          Enabled: true,
          Attributes: [{ Name: 'email', Value: 'manager@greenleaf.demo' }],
        },
        {
          Username: 'staff@greenleaf.demo',
          UserStatus: 'FORCE_CHANGE_PASSWORD',
          Enabled: true,
          Attributes: [{ Name: 'email', Value: 'staff@greenleaf.demo' }],
        },
      ],
    });
    cognitoMock.on(ListUsersInGroupCommand).resolves({
      Users: [{ Username: 'manager@greenleaf.demo' }],
    });

    const response = await handler({ httpMethod: 'GET', ...withManagerClaims() });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.find((u: any) => u.username === 'manager@greenleaf.demo').role).toBe('manager');
    expect(body.find((u: any) => u.username === 'staff@greenleaf.demo').role).toBe('staff');
  });
});

describe('unhandled method', () => {
  it('returns 405', async () => {
    const response = await handler({ httpMethod: 'DELETE', ...withManagerClaims() });
    expect(response.statusCode).toBe(405);
  });
});

describe('errors', () => {
  it('returns 500 and never throws when Cognito fails', async () => {
    cognitoMock.on(ListUsersCommand).rejects(new Error('boom'));
    const response = await handler({ httpMethod: 'GET', ...withManagerClaims() });
    expect(response.statusCode).toBe(500);
  });
});

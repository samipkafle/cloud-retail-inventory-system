import {
  DynamoDBClient,
  PutItemCommand,
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const tableName = process.env.TABLE_NAME!;

<<<<<<< HEAD
=======
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// API Gateway's Cognito authorizer stringifies group membership as
// "[manager]" (or "[manager,other]") in event.requestContext.authorizer.claims
function isManager(event: any): boolean {
  const groupsClaim =
    event.requestContext?.authorizer?.claims?.['cognito:groups'];
  return typeof groupsClaim === 'string' && groupsClaim.includes('manager');
}

function forbidden() {
  return {
    statusCode: 403,
    headers: corsHeaders,
    body: JSON.stringify({
      message: 'Only managers can manage products',
    }),
  };
}

>>>>>>> origin/virasanh
export const handler = async (event: any) => {
  try {
    const method = event.httpMethod;
    const productId = event.pathParameters?.productId;

    // POST /products
    if (method === 'POST') {
<<<<<<< HEAD
=======
      // TEMP: manager check disabled while Cognito auth is off in
      // cdk-stack.ts — event.requestContext.authorizer is always undefined
      // without it, so isManager() would reject every request. Restore
      // alongside the Cognito authorizer before demo/submission.
      // if (!isManager(event)) {
      //   return forbidden();
      // }

>>>>>>> origin/virasanh
      const body = JSON.parse(event.body || '{}');

      if (!body.productId || !body.name || body.price === undefined) {
        return {
          statusCode: 400,
<<<<<<< HEAD
          headers: {
            'Content-Type': 'application/json',
          },
=======
          headers: corsHeaders,
>>>>>>> origin/virasanh
          body: JSON.stringify({
            message: 'productId, name and price are required',
          }),
        };
      }

      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: {
            productId: {
              S: body.productId,
            },
            name: {
              S: body.name,
            },
            price: {
              N: String(body.price),
            },
            stock: {
              N: String(body.stock || 0),
            },
            reorderThreshold: {
              N: String(body.reorderThreshold || 0),
            },
          },
        })
      );

      return {
        statusCode: 201,
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
        },
=======
        headers: corsHeaders,
>>>>>>> origin/virasanh
        body: JSON.stringify({
          message: 'Product created successfully',
          product: body,
        }),
      };
    }

    // GET /products
    if (method === 'GET' && !productId) {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
        })
      );

      const products = (result.Items || []).map((item) => ({
        productId: item.productId?.S,
        name: item.name?.S,
        price: item.price?.N ? Number(item.price.N) : 0,
        stock: item.stock?.N ? Number(item.stock.N) : 0,
        reorderThreshold: item.reorderThreshold?.N
          ? Number(item.reorderThreshold.N)
          : 0,
      }));

      return {
        statusCode: 200,
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
        },
=======
        headers: corsHeaders,
>>>>>>> origin/virasanh
        body: JSON.stringify(products),
      };
    }

    // GET /products/{productId}
    if (method === 'GET' && productId) {
      const result = await client.send(
        new GetItemCommand({
          TableName: tableName,
          Key: {
            productId: {
              S: productId,
            },
          },
        })
      );

      if (!result.Item) {
        return {
          statusCode: 404,
<<<<<<< HEAD
          headers: {
            'Content-Type': 'application/json',
          },
=======
          headers: corsHeaders,
>>>>>>> origin/virasanh
          body: JSON.stringify({
            message: 'Product not found',
          }),
        };
      }

      const product = {
        productId: result.Item.productId?.S,
        name: result.Item.name?.S,
        price: result.Item.price?.N
          ? Number(result.Item.price.N)
          : 0,
        stock: result.Item.stock?.N
          ? Number(result.Item.stock.N)
          : 0,
        reorderThreshold: result.Item.reorderThreshold?.N
          ? Number(result.Item.reorderThreshold.N)
          : 0,
      };

      return {
        statusCode: 200,
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
        },
=======
        headers: corsHeaders,
>>>>>>> origin/virasanh
        body: JSON.stringify(product),
      };
    }

    // PUT /products/{productId}
    if (method === 'PUT' && productId) {
<<<<<<< HEAD
=======
      // TEMP: manager check disabled while Cognito auth is off — see POST handler above.
      // if (!isManager(event)) {
      //   return forbidden();
      // }

>>>>>>> origin/virasanh
      const body = JSON.parse(event.body || '{}');

      if (
        body.name === undefined &&
        body.price === undefined &&
        body.stock === undefined &&
        body.reorderThreshold === undefined
      ) {
        return {
          statusCode: 400,
<<<<<<< HEAD
          headers: {
            'Content-Type': 'application/json',
          },
=======
          headers: corsHeaders,
>>>>>>> origin/virasanh
          body: JSON.stringify({
            message: 'Provide name, price, stock or reorderThreshold to update',
          }),
        };
      }

      const updateExpressions: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (body.name !== undefined) {
        updateExpressions.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = {
          S: String(body.name),
        };
      }

      if (body.price !== undefined) {
        updateExpressions.push('#price = :price');
        expressionAttributeNames['#price'] = 'price';
        expressionAttributeValues[':price'] = {
          N: String(body.price),
        };
      }

      if (body.stock !== undefined) {
        updateExpressions.push('#stock = :stock');
        expressionAttributeNames['#stock'] = 'stock';
        expressionAttributeValues[':stock'] = {
          N: String(body.stock),
        };
      }

      if (body.reorderThreshold !== undefined) {
        updateExpressions.push('#reorderThreshold = :reorderThreshold');
        expressionAttributeNames['#reorderThreshold'] = 'reorderThreshold';
        expressionAttributeValues[':reorderThreshold'] = {
          N: String(body.reorderThreshold),
        };
      }

      const result = await client.send(
        new UpdateItemCommand({
          TableName: tableName,
          Key: {
            productId: {
              S: productId,
            },
          },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ReturnValues: 'ALL_NEW',
        })
      );

      const updatedProduct = {
        productId: result.Attributes?.productId?.S,
        name: result.Attributes?.name?.S,
        price: result.Attributes?.price?.N
          ? Number(result.Attributes.price.N)
          : 0,
        stock: result.Attributes?.stock?.N
          ? Number(result.Attributes.stock.N)
          : 0,
        reorderThreshold: result.Attributes?.reorderThreshold?.N
          ? Number(result.Attributes.reorderThreshold.N)
          : 0,
      };

      return {
        statusCode: 200,
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
        },
=======
        headers: corsHeaders,
>>>>>>> origin/virasanh
        body: JSON.stringify({
          message: 'Product updated successfully',
          product: updatedProduct,
        }),
      };
    }

    // DELETE /products/{productId}
    if (method === 'DELETE' && productId) {
<<<<<<< HEAD
=======
      // TEMP: manager check disabled while Cognito auth is off — see POST handler above.
      // if (!isManager(event)) {
      //   return forbidden();
      // }

>>>>>>> origin/virasanh
      await client.send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: {
            productId: {
              S: productId,
            },
          },
        })
      );

      return {
        statusCode: 200,
<<<<<<< HEAD
        headers: {
          'Content-Type': 'application/json',
        },
=======
        headers: corsHeaders,
>>>>>>> origin/virasanh
        body: JSON.stringify({
          message: 'Product deleted successfully',
          productId,
        }),
      };
    }

    return {
      statusCode: 405,
<<<<<<< HEAD
      headers: {
        'Content-Type': 'application/json',
      },
=======
      headers: corsHeaders,
>>>>>>> origin/virasanh
      body: JSON.stringify({
        message: 'Method not allowed',
      }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
<<<<<<< HEAD
      headers: {
        'Content-Type': 'application/json',
      },
=======
      headers: corsHeaders,
>>>>>>> origin/virasanh
      body: JSON.stringify({
        message: 'Internal server error',
      }),
    };
  }
<<<<<<< HEAD
};
=======
};
>>>>>>> origin/virasanh

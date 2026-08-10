"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({});
const dynamodb = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'RetailInventory';
const handler = async (event) => {
    try {
        const product = {
            productId: event.productId,
            productName: event.productName,
            quantity: event.quantity,
            price: event.price,
        };
        await dynamodb.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLE_NAME,
            Item: product,
        }));
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Product added successfully',
                product,
            }),
        };
    }
    catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to add product',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW52ZW50b3J5LWhhbmRsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbnZlbnRvcnktaGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBRytCO0FBRS9CLE1BQU0sTUFBTSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN0QyxNQUFNLFFBQVEsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFckQsTUFBTSxVQUFVLEdBQUcsaUJBQWlCLENBQUM7QUFFOUIsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQVUsRUFBRSxFQUFFO0lBQzFDLElBQUksQ0FBQztRQUNILE1BQU0sT0FBTyxHQUFHO1lBQ2QsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTO1lBQzFCLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztZQUM5QixRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7WUFDeEIsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1NBQ25CLENBQUM7UUFFRixNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQ2pCLElBQUkseUJBQVUsQ0FBQztZQUNiLFNBQVMsRUFBRSxVQUFVO1lBQ3JCLElBQUksRUFBRSxPQUFPO1NBQ2QsQ0FBQyxDQUNILENBQUM7UUFFRixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLDRCQUE0QjtnQkFDckMsT0FBTzthQUNSLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRXJCLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsdUJBQXVCO2FBQ2pDLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQWpDVyxRQUFBLE9BQU8sV0FpQ2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHtcbiAgRHluYW1vREJEb2N1bWVudENsaWVudCxcbiAgUHV0Q29tbWFuZCxcbn0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcblxuY29uc3QgY2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGR5bmFtb2RiID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGNsaWVudCk7XG5cbmNvbnN0IFRBQkxFX05BTUUgPSAnUmV0YWlsSW52ZW50b3J5JztcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IGFueSkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IHByb2R1Y3QgPSB7XG4gICAgICBwcm9kdWN0SWQ6IGV2ZW50LnByb2R1Y3RJZCxcbiAgICAgIHByb2R1Y3ROYW1lOiBldmVudC5wcm9kdWN0TmFtZSxcbiAgICAgIHF1YW50aXR5OiBldmVudC5xdWFudGl0eSxcbiAgICAgIHByaWNlOiBldmVudC5wcmljZSxcbiAgICB9O1xuXG4gICAgYXdhaXQgZHluYW1vZGIuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBwcm9kdWN0LFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ1Byb2R1Y3QgYWRkZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgcHJvZHVjdCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihlcnJvcik7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIGFkZCBwcm9kdWN0JyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=
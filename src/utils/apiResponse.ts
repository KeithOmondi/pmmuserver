export const apiResponse = {
  success: (data: any, message = "Success") => ({
    success: true,
    message,
    data
  }),

  error: (message = "Error", statusCode = 400) => ({
    success: false,
    message,
    statusCode
  })
};

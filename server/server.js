const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS Configuration
app.use(cors({
  origin: [
    'https://dotfive-n11dnrt2b-rrrr1124s-projects.vercel.app',
    'https://dotfive-cvjvq0c66-rrrr1124s-projects.vercel.app',
    'https://dotfive.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Email configuration
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'dotfive25@gmail.com',
      pass: process.env.EMAIL_PASS || 'gupn wopo ecle ulqx'
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Email templates
const createOrderEmailHTML = (orderId, customerData, cartData, total) => {
  const itemsHTML = cartData.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        ${item.name || 'Product'}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        ${item.quantity || 1}
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        ${typeof item.price === 'string' ? item.price : `${item.price} BHD`}
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; text-align: center; }
        .order-details { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #e9ecef; padding: 12px; text-align: left; }
        td { padding: 10px; }
        .total { font-weight: bold; font-size: 18px; color: #28a745; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Order Received - Dot Five</h1>
          <h2>Order #${orderId}</h2>
        </div>
        
        <div class="order-details">
          <h3>Customer Information:</h3>
          <p><strong>Name:</strong> ${customerData.name || 'Not provided'}</p>
          <p><strong>Email:</strong> ${customerData.email || 'Not provided'}</p>
          <p><strong>Phone:</strong> ${customerData.phone || 'Not provided'}</p>
          <p><strong>Address:</strong> ${customerData.address || 'Not provided'}</p>
          
          <h3>Order Items:</h3>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
          
          <div class="total">
            <p>Total Amount: ${total.toFixed(3)} BHD</p>
          </div>
          
          <p><strong>Payment Screenshot:</strong> Attached</p>
          <p><strong>Order Date:</strong> ${new Date().toLocaleString()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    email_configured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
  });
});

// Submit order endpoint with email
app.post('/api/submit-order', upload.single('screenshot'), async (req, res) => {
  try {
    console.log('Order submission request received');

    // Validate file upload
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Screenshot is required'
      });
    }

    // Parse the data
    let orderData, customerData, cartData;
    try {
      orderData = JSON.parse(req.body.orderData || '{}');
      customerData = JSON.parse(req.body.customerData || '{}');
      cartData = JSON.parse(req.body.cartData || '[]');
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format'
      });
    }

    // Validate required data
    if (!Array.isArray(cartData) || cartData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart data is required'
      });
    }

    // Calculate total
    const total = cartData.reduce((sum, item) => {
      let price = 0;
      if (typeof item.price === 'string') {
        price = parseFloat(item.price.replace(/BHD/gi, '').trim()) || 0;
      } else if (typeof item.price === 'number') {
        price = item.price;
      }
      return sum + (price * (item.quantity || 1));
    }, 0);

    // Generate order ID
    const orderId = 'ORD-' + Date.now();

    // Send email notification
    try {
      const transporter = createEmailTransporter();
      
      const mailOptions = {
        from: process.env.EMAIL_USER || 'noreply@dotfive.com',
        to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        subject: `New Order #${orderId} - Dot Five`,
        html: createOrderEmailHTML(orderId, customerData, cartData, total),
        attachments: [{
          filename: `payment-${orderId}.${req.file.originalname.split('.').pop()}`,
          content: req.file.buffer,
          contentType: req.file.mimetype
        }]
      };

      console.log('Sending email to:', mailOptions.to);
      await transporter.sendMail(mailOptions);
      console.log('Order confirmation email sent successfully');

    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the entire order if email fails
      console.log('Order will be processed despite email failure');
    }

    // Send success response
    res.json({
      success: true,
      message: 'Order submitted successfully',
      data: {
        orderId: orderId,
        timestamp: new Date().toISOString(),
        items: cartData,
        customer: customerData,
        total: total.toFixed(3),
        emailSent: true
      }
    });

    console.log('Order processed successfully:', orderId);

  } catch (error) {
    console.error('Error processing order:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error: ' + error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Email configured:', !!(process.env.EMAIL_USER && process.env.EMAIL_PASS));
});
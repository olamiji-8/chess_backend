// Enhanced Notification Controller with Email and Push Notifications
const Notification = require('../models/Notification');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const VerificationRequest = require('../models/verification');
const Transaction = require('../models/Transaction');
const asyncHandler = require('express-async-handler');
const nodemailer = require('nodemailer');
const webpush = require('web-push');

// ==================== EMAIL CONFIGURATION ====================

// Gmail transporter setup - FIXED: Changed createTransporter to createTransport
const createEmailTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER, // Your Gmail address
      pass: process.env.GMAIL_APP_PASSWORD // Gmail App Password
    }
  });
};

// ==================== PUSH NOTIFICATION CONFIGURATION ====================

// Configure web-push
webpush.setVapidDetails(
  'mailto:' + process.env.GMAIL_USER,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ==================== NOTIFICATION DELIVERY SERVICES ====================

// Email notification service
const sendEmailNotification = async (user, title, message, type) => {
  try {
    // Skip email if user has disabled email notifications
    if (user.emailNotifications === false) {
      return { success: false, reason: 'User disabled email notifications' };
    }

    const transporter = createEmailTransporter();
    
    // Email template based on notification type
    const emailTemplates = {
      'system_message': {
        subject: `64SQURS - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">64SQURS</h1>
              <p style="color: white; margin: 5px 0;">Your Premier Chess Tournament Platform</p>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333; margin-bottom: 20px;">${title}</h2>
              <p style="color: #666; line-height: 1.6; font-size: 16px;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Visit 64SQURS</a>
              </div>
            </div>
            <div style="padding: 20px; text-align: center; color: #888; font-size: 12px;">
              <p>This is an automated notification from 64SQURS. If you no longer wish to receive these emails, you can disable them in your account settings.</p>
            </div>
          </div>
        `
      },
      'tournament_created': {
        subject: `Tournament Created - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">🏆 Tournament Created!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Tournaments</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_registration': {
        subject: `Tournament Registration - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">⚡ Registration Confirmed!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/my-tournaments" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">My Tournaments</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_reminder': {
        subject: `Tournament Reminder - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">⏰ Tournament Starting Soon!</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #ff9a9e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Tournament</a>
              </div>
            </div>
          </div>
        `
      },
      'tournament_result': {
        subject: `Tournament Results - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); padding: 20px; text-align: center;">
              <h1 style="color: #333; margin: 0;">🎉 Tournament Results</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/tournaments" style="background: #fcb69f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Results</a>
              </div>
            </div>
          </div>
        `
      },
      'wallet_update': {
        subject: `Wallet Update - ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); padding: 20px; text-align: center;">
              <h1 style="color: #333; margin: 0;">💰 Wallet Update</h1>
            </div>
            <div style="padding: 30px; background: #f9f9f9;">
              <h2 style="color: #333;">${title}</h2>
              <p style="color: #666; line-height: 1.6;">${message}</p>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${process.env.FRONTEND_URL}/wallet" style="background: #fcb69f; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Wallet</a>
              </div>
            </div>
          </div>
        `
      },
      'system_message': {
        subject: `🎉 Welcome to 64SQURS - Your Chess Journey Begins!`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: bold;">♟️ 64SQURS</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Your Premier Chess Tournament Platform</p>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 40px 30px; background: #f8fafc;">
              <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px;">${title}</h2>
                
                <div style="color: #4a5568; line-height: 1.8; font-size: 16px; margin: 0 0 25px 0;">
                  ${message.replace(/\n/g, '<br>')}
                </div>
                
                <!-- Call to Action -->
                <div style="text-align: center; margin: 30px 0 20px 0;">
                  <a href="${process.env.FRONTEND_URL || 'https://64squrs.com'}" 
                     style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; 
                            padding: 15px 35px; 
                            text-decoration: none; 
                            border-radius: 25px; 
                            display: inline-block; 
                            font-weight: bold; 
                            font-size: 16px;
                            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                    🎯 Start Playing Now
                  </a>
                </div>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 25px; text-align: center; background: #edf2f7;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                You can manage notifications in your 
                <a href="${process.env.FRONTEND_URL || 'https://64squrs.com'}/settings" style="color: #667eea;">account settings</a>.
              </p>
            </div>
          </div>
        `
      },
    };

    const template = emailTemplates[type] || emailTemplates['system_message'];
    
    const mailOptions = {
      from: `"64SQURS" <${process.env.GMAIL_USER}>`,
      to: user.email,
      subject: template.subject,
      html: template.html
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};

// Push notification service - FIXED: Added better validation for push subscriptions
const sendPushNotification = async (user, title, message, type, relatedId = null) => {
  try {
    // Skip push notification if user has disabled them or no valid subscription
    if (user.pushNotifications === false) {
      return { success: false, reason: 'User disabled push notifications' };
    }

    // FIXED: Better validation for push subscription
    if (!user.pushSubscription || 
        !user.pushSubscription.endpoint || 
        typeof user.pushSubscription.endpoint !== 'string' ||
        user.pushSubscription.endpoint.trim() === '') {
      return { success: false, reason: 'No valid push subscription found' };
    }

    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/icon-192x192.png', // Your app icon
      badge: '/badge-72x72.png', // Small badge icon
      data: {
        type,
        relatedId,
        url: getNotificationUrl(type, relatedId),
        timestamp: new Date().toISOString()
      },
      actions: [
        {
          action: 'view',
          title: 'View',
          icon: '/view-icon.png'
        },
        {
          action: 'dismiss',
          title: 'Dismiss',
          icon: '/dismiss-icon.png'
        }
      ],
      requireInteraction: ['tournament_reminder', 'transaction_failed'].includes(type),
      vibrate: [200, 100, 200]
    });

    const result = await webpush.sendNotification(user.pushSubscription, payload);
    console.log('Push notification sent successfully');
    return { success: true, result };
    
  } catch (error) {
    console.error('Error sending push notification:', error);
    
    // If subscription is invalid, remove it from user
    if (error.statusCode === 410 || error.statusCode === 404) {
      await User.findByIdAndUpdate(user._id, { 
        $unset: { pushSubscription: 1 } 
      });
    }
    
    return { success: false, error: error.message };
  }
};

// Helper function to get URL for notification
const getNotificationUrl = (type, relatedId) => {
  const baseUrl = process.env.FRONTEND_URL;
  
  switch (type) {
    case 'tournament_created':
    case 'tournament_registration':
    case 'tournament_reminder':
    case 'tournament_result':
      return `${baseUrl}/tournaments/${relatedId}`;
    case 'transaction_success':
    case 'transaction_failed':
      return `${baseUrl}/wallet/transactions/${relatedId}`;
    case 'account_verification':
      return `${baseUrl}/verification`;
    case 'wallet_update':
      return `${baseUrl}/wallet`;
    default:
      return `${baseUrl}/notifications`;
  }
};

// @desc    Get user notifications with pagination and filtering
// @route   GET /api/notifications
// @access  Private
exports.getUserNotifications = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    type, 
    read, 
    sortBy = 'createdAt',
    order = 'desc' 
  } = req.query;

  console.log(`🔍 Fetching notifications for user: ${req.user.id}`, {
    page,
    limit,
    type,
    read,
    sortBy,
    order
  });

  // Build filter query
  const filterQuery = { user: req.user.id };
  
  if (type) {
    filterQuery.type = type;
  }
  
  if (read !== undefined) {
    filterQuery.isRead = read === 'true';
  }

  console.log(`🔍 Filter query:`, filterQuery);

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sortOrder = order === 'asc' ? 1 : -1;

  try {
    // 🔍 DEBUGGING: Check total notifications for this user first
    const totalUserNotifications = await Notification.countDocuments({ user: req.user.id });
    console.log(`📊 Total notifications for user ${req.user.id}: ${totalUserNotifications}`);

    // Get notifications with pagination
    const notifications = await Notification.find(filterQuery)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .populate({
        path: 'relatedId',
        select: 'title name amount', // Adjust fields based on your related models
      });

    console.log(`📱 Found ${notifications.length} notifications matching filter`);

    // Get total count for pagination
    const totalNotifications = await Notification.countDocuments(filterQuery);
    const totalPages = Math.ceil(totalNotifications / parseInt(limit));

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      isRead: false
    });

    console.log(`📊 Notification stats:`, {
      totalNotifications,
      totalPages,
      unreadCount,
      currentResults: notifications.length
    });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalNotifications,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        },
        unreadCount
      }
    });

  } catch (error) {
    console.error('❌ Error fetching notifications:', {
      message: error.message,
      stack: error.stack,
      userId: req.user.id,
      filterQuery
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
});


// @desc    Get notification statistics for user
// @route   GET /api/notifications/stats
// @access  Private
exports.getNotificationStats = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    // Get overall stats
    const totalNotifications = await Notification.countDocuments({ user: userId });
    const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
    const readCount = totalNotifications - unreadCount;

    // Get stats by type
    const typeStats = await Notification.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          unread: {
            $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          type: '$_id',
          total: 1,
          unread: 1,
          read: { $subtract: ['$total', '$unread'] },
          _id: 0
        }
      }
    ]);

    // Get notifications from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await Notification.countDocuments({
      user: userId,
      createdAt: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: totalNotifications,
          unread: unreadCount,
          read: readCount,
          recent: recentCount,
          unreadPercentage: totalNotifications > 0 ? Math.round((unreadCount / totalNotifications) * 100) : 0
        },
        byType: typeStats
      }
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notification statistics'
    });
  }
});

// @desc    Mark all notifications as read for user
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllNotificationsRead = asyncHandler(async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { 
        user: req.user.id, 
        isRead: false 
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
      data: {
        modifiedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
});

// @desc    Clear all read notifications for user
// @route   DELETE /api/notifications/clear-read
// @access  Private
exports.clearReadNotifications = asyncHandler(async (req, res) => {
  try {
    // Optional: Only delete notifications older than a certain time
    const { olderThan = 7 } = req.query; // days
    const cutoffDate = new Date(Date.now() - parseInt(olderThan) * 24 * 60 * 60 * 1000);

    const deleteQuery = {
      user: req.user.id,
      isRead: true
    };

    // If olderThan is specified, only delete old read notifications
    if (olderThan) {
      deleteQuery.createdAt = { $lte: cutoffDate };
    }

    const result = await Notification.deleteMany(deleteQuery);

    res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} read notifications`,
      data: {
        deletedCount: result.deletedCount
      }
    });

  } catch (error) {
    console.error('Error clearing read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing read notifications'
    });
  }
});

// @desc    Mark specific notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
exports.markNotificationRead = asyncHandler(async (req, res) => {
  try {
    const notificationId = req.params.id;

    // Find and update the specific notification
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: notificationId, 
        user: req.user.id 
      },
      { 
        isRead: true
      },
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or unauthorized'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: notification
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
});

// ==================== ENHANCED UTILITY FUNCTIONS ====================

// Enhanced base utility function to create notifications with email and push
exports.createNotification = async (userId, title, message, type, relatedId = null, relatedModel = null, options = {}) => {
  try {
    console.log(`🔔 Creating notification for user ${userId}:`, {
      title,
      type,
      relatedId,
      relatedModel,
      options
    });

    // 🔍 DEBUGGING: Validate inputs
    if (!userId || !title || !message || !type) {
      const error = `Missing required fields: userId=${userId}, title=${title}, message=${message}, type=${type}`;
      console.error(`❌ ${error}`);
      throw new Error(error);
    }

    // Create database notification
    const notificationData = {
      user: userId,
      title,
      message,
      type,
      relatedId,
      relatedModel,
      isRead: false,
      emailSent: false,
      pushSent: false
    };

    console.log(`📝 Creating notification with data:`, notificationData);
    
    const notification = await Notification.create(notificationData);
    
    console.log(`✅ Notification created in database:`, {
      id: notification._id,
      user: notification.user,
      title: notification.title,
      type: notification.type
    });
    
    // Get user details for email and push notifications
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ User not found for notification:', userId);
      return notification; // Still return the notification even if user not found for additional services
    }

    console.log(`👤 User found for additional notifications:`, {
      id: user._id,
      email: user.email,
      pushSubscriptions: user.pushSubscriptions?.length || 0
    });

    // Send email notification (unless disabled in options)
    if (options.sendEmail !== false && user.email && user.email.includes('@')) {
      try {
        console.log(`📧 Sending email notification...`);
        const emailResult = await sendEmailNotification(user, title, message, type);
        notification.emailSent = emailResult.success;
        notification.emailError = emailResult.success ? null : emailResult.error;
        console.log(`📧 Email result:`, emailResult);
      } catch (emailError) {
        console.error(`❌ Email notification error:`, emailError);
        notification.emailError = emailError.message;
      }
    }

    // Send push notification (unless disabled in options)
    if (options.sendPush !== false && user.pushSubscriptions?.length > 0) {
      try {
        console.log(`📱 Sending push notification...`);
        const pushResult = await sendPushNotification(user, title, message, type, relatedId);
        notification.pushSent = pushResult.success;
        notification.pushError = pushResult.success ? null : pushResult.error;
        console.log(`📱 Push result:`, pushResult);
      } catch (pushError) {
        console.error(`❌ Push notification error:`, pushError);
        notification.pushError = pushError.message;
      }
    }

    // Save notification with delivery status
    await notification.save();
    
    console.log(`💾 Notification saved with final status:`, {
      id: notification._id,
      emailSent: notification.emailSent,
      pushSent: notification.pushSent
    });
    
    // 🔥 FIXED: Return "notification" instead of "notation"
    return notification;
  } catch (error) {
    console.error('❌ Error creating notification:', {
      message: error.message,
      stack: error.stack,
      userId,
      title,
      type
    });
    throw error; // Re-throw to handle in calling function
  }
};

// 🔥 ADDITIONAL: Helper function to check valid notification types
exports.getValidNotificationTypes = async () => {
  try {
    // This will help you see what enum values are allowed
    const schema = Notification.schema.paths.type;
    if (schema && schema.enumValues) {
      console.log('📋 Valid notification types:', schema.enumValues);
      return schema.enumValues;
    }
    return ['info', 'success', 'warning', 'error', 'system']; // Default fallback
  } catch (error) {
    console.error('❌ Error getting notification types:', error);
    return ['info', 'success', 'warning', 'error', 'system'];
  }
};


// ==================== USER PREFERENCE MANAGEMENT ====================

// @desc    Update user notification preferences
// @route   PUT /api/notifications/preferences
// @access  Private
exports.updateNotificationPreferences = asyncHandler(async (req, res) => {
  const { emailNotifications, pushNotifications, notificationTypes } = req.body;
  
  const updateData = {};
  
  if (typeof emailNotifications === 'boolean') {
    updateData.emailNotifications = emailNotifications;
  }
  
  if (typeof pushNotifications === 'boolean') {
    updateData.pushNotifications = pushNotifications;
  }
  
  if (notificationTypes && typeof notificationTypes === 'object') {
    updateData.notificationTypes = notificationTypes;
  }
  
  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, select: 'emailNotifications pushNotifications notificationTypes' }
  );
  
  res.status(200).json({
    success: true,
    message: 'Notification preferences updated',
    data: user
  });
});

// @desc    Subscribe to push notifications
// @route   POST /api/notifications/subscribe-push
// @access  Private
exports.subscribeToPush = asyncHandler(async (req, res) => {
  const { subscription } = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({
      success: false,
      message: 'Valid push subscription required'
    });
  }
  
  await User.findByIdAndUpdate(req.user.id, {
    pushSubscription: subscription,
    pushNotifications: true
  });
  
  res.status(200).json({
    success: true,
    message: 'Push notification subscription saved'
  });
});

// @desc    Unsubscribe from push notifications
// @route   DELETE /api/notifications/unsubscribe-push
// @access  Private
exports.unsubscribeFromPush = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, {
    $unset: { pushSubscription: 1 },
    pushNotifications: false
  });
  
  res.status(200).json({
    success: true,
    message: 'Push notification unsubscribed'
  });
});


// 👋 Welcome to 64SQURS - Fixed with valid enum type
exports.notifyUserWelcome = async (userId) => {
  try {
    console.log(`🎯 Starting enhanced welcome notification process for user: ${userId}`);
    
    // STEP 1: Fetch the complete user object
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`❌ User not found: ${userId}`);
      return { success: false, error: 'User not found' };
    }
    
    console.log(`👤 User found:`, {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      lichessUsername: user.lichessUsername,
      welcomeNotifications: user.notificationTypes?.welcome
    });
    
    // Check if user wants welcome notifications
    if (!user.wantsNotification('welcome')) {
      console.log(`🔕 User has disabled welcome notifications`);
      return { 
        success: true, 
        skipped: true, 
        reason: 'User disabled welcome notifications' 
      };
    }
    
    const title = "🎉 Welcome to 64SQURS!";
    const message = `Welcome ${user.lichessUsername || user.fullName}! You've successfully joined 64SQURS. Ready to dominate the chess world? 🏆`;
    
    // STEP 2: Create in-app notification using valid enum type
    console.log(`📱 Creating in-app notification...`);
    let notificationResult;
    
    try {
      // 🔥 OPTION A: Use 'system_message' (existing valid enum)
      notificationResult = await exports.createNotification(
        userId,
        title,
        message,
        'system_message', // 🔥 Using valid enum value
        null,
        null,
        { 
          sendEmail: true,
          sendPush: true,
          priority: 'high',
          requireInteraction: true,
          welcomeType: true // Custom flag to identify this as welcome message
        }
      );
      
      console.log(`📱 In-app notification result:`, notificationResult);
      
      if (notificationResult && notificationResult._id) {
        console.log(`✅ Notification created successfully with ID: ${notificationResult._id}`);
        
        // Verify it exists in database
        const verifyNotification = await Notification.findById(notificationResult._id);
        if (verifyNotification) {
          console.log(`✅ Notification verified in database:`, {
            id: verifyNotification._id,
            user: verifyNotification.user,
            title: verifyNotification.title,
            type: verifyNotification.type,
            isRead: verifyNotification.isRead,
            createdAt: verifyNotification.createdAt
          });
        } else {
          console.error(`❌ Notification not found in database after creation!`);
        }
      }
      
    } catch (notificationError) {
      console.error(`❌ In-app notification error:`, notificationError);
      notificationResult = { 
        success: false, 
        error: notificationError.message 
      };
    }
    
    // STEP 3: Send push notification if user has subscriptions
    console.log(`🚀 Checking for push notification...`);
    let pushResult = { success: true, skipped: true };
    
    try {
      if (user.pushSubscription && user.pushSubscription.endpoint) {
        console.log(`📱 Sending push notification to user...`);
        pushResult = await sendPushNotification(user, title, message, 'system_message', null, {
          priority: 'high',
          requireInteraction: true
        });
        console.log(`📱 Push result:`, pushResult);
      } else {
        console.log(`📱 No push subscription found, skipping push notification`);
        pushResult = { success: true, skipped: true, reason: 'No push subscription' };
      }
    } catch (pushError) {
      console.error(`❌ Push notification error:`, pushError);
      pushResult = { success: false, error: pushError.message };
    }
    
    // STEP 4: Return comprehensive results
    const finalResult = {
      success: notificationResult?._id ? true : false,
      notification: notificationResult,
      push: pushResult,
      user: {
        id: user._id,
        email: user.email,
        lichessUsername: user.lichessUsername,
        hasEmailNotifications: user.emailNotifications,
        hasPushNotifications: user.pushNotifications,
        wantsWelcomeNotifications: user.notificationTypes?.welcome
      },
      summary: {
        notificationCreated: notificationResult?._id ? true : false,
        pushSent: pushResult.sent || false,
        emailSent: notificationResult?.emailSent || false
      }
    };
    
    console.log(`🏁 Enhanced welcome notification completed:`, finalResult.summary);
    
    return finalResult;
    
  } catch (error) {
    console.error('❌ Critical error in enhanced welcome notification:', {
      message: error.message,
      stack: error.stack,
      userId: userId
    });
    return { 
      success: false, 
      error: error.message,
      userId: userId 
    };
  }
};

// ==================== TOURNAMENT NOTIFICATIONS ====================

// Notify when a tournament is created
exports.notifyTournamentCreated = async (organizerId, tournamentId, tournamentTitle) => {
  try {
    const title = "Tournament Created Successfully! 🏆";
    const message = `Your tournament "${tournamentTitle}" has been created successfully and is now live on 64SQURS. Players can now register and join your tournament.`;
    
    return await exports.createNotification(
      organizerId,
      title,
      message,
      'tournament_created',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament created notification:', error);
    return null;
  }
};

// ✅ You have successfully registered for [Tournament Title].
// Trigger: Immediately after a user completes payment and registration for any tournament
exports.notifyTournamentRegistration = async (userId, tournamentId, tournamentTitle, tournamentLink, tournamentPassword = null) => {
  try {
    // Dynamic tournament title insertion as per documentation
    const title = `✅ You have successfully registered for ${tournamentTitle}.`;
    
    // Message content matches documentation exactly
    let message = `Your seat is secured! You've successfully registered for the ${tournamentTitle}. Make sure to prepare ahead and bring your A-game. We'll notify you when it's about to begin.`;
    
    // Add tournament link
    message += ` Tournament Link: ${tournamentLink}`;
    
    // Add password if provided
    if (tournamentPassword && tournamentPassword.trim() !== '') {
      message += ` Password: ${tournamentPassword}`;
    }
    
    message += ` Good luck!`;
    
    // Real-time trigger (within seconds after successful registration and payment confirmation)
    return await exports.createNotification(
      userId,
      title,
      message,
      'tournament_registration',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament registration notification:', error);
    return null;
  }
};

// Notify organizer when someone registers for their tournament
exports.notifyOrganizerNewRegistration = async (organizerId, tournamentId, tournamentTitle, participantName) => {
  try {
    const title = "New Tournament Registration";
    const message = `${participantName} has registered for your tournament "${tournamentTitle}". Your tournament is gaining momentum!`;
    
    return await exports.createNotification(
      organizerId,
      title,
      message,
      'tournament_registration',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending organizer registration notification:', error);
    return null;
  }
};

// 🕐 [Tournament Title] is starting in 5 minutes.
// Trigger: Exactly 5 minutes before a tournament that a user has registered for begins
exports.notifyTournamentStartingInFiveMinutes = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    // Background job runs scheduled check for all tournaments user has registered for
    const participantIds = tournament.participants.map(p => p._id);
    
    // Dynamic Tournament Title insertion based on specific tournament
    const title = `🕐 ${tournament.title} is starting in 5 minutes.`;
    
    // Message content matches documentation exactly
    const message = `Get ready! The ${tournament.title} you registered for is kicking off in just 5 minutes. Make sure your board is set, and your focus is sharp. Click here to join the action now.`;
    
    // Uses tournament_start_time to calculate when to trigger this notification
    return await exports.createBulkNotifications(
      participantIds,  
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending 5-minute tournament notification:', error);
    return null;
  }
};

// General tournament reminder (hours before)
exports.notifyTournamentReminder = async (tournamentId, hoursBeforeStart = 1) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const timeText = hoursBeforeStart === 1 ? '1 hour' : `${hoursBeforeStart} hours`;
    const title = `Tournament Reminder - Starting in ${timeText}`;
    const message = `Don't forget! "${tournament.title}" is starting in ${timeText}. Make sure you're prepared and ready to compete for the prizes!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament reminder:', error);
    return null;
  }
};

// Notify when tournament has started
exports.notifyTournamentStarted = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const title = "Tournament Has Started! 🚀";
    const message = `"${tournament.title}" has officially started! Head over to the tournament page and begin your matches. May the best player win!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_reminder',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament started notification:', error);
    return null;
  }
};

// Notify when tournament is completed
exports.notifyTournamentCompleted = async (tournamentId) => {
  try {
    const Tournament = require('../models/Tournament');
    const tournament = await Tournament.findById(tournamentId).populate('participants');
    
    if (!tournament || tournament.participants.length === 0) {
      return null;
    }

    const participantIds = tournament.participants.map(p => p._id);
    const title = "Tournament Completed! 🏁";
    const message = `"${tournament.title}" has been completed! Check the final results and see how you performed. Thanks for participating!`;
    
    return await exports.createBulkNotifications(
      participantIds,
      title,
      message,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament completed notification:', error);
    return null;
  }
};

// 🏆 Congratulations! You won 50,000.
// Trigger: Immediately after a user wins a tournament and their prize has been computed
exports.notifyTournamentWinner = async (userId, tournamentId, tournamentTitle, position = 1, prizeAmount = 0) => {
  try {
    // Calculate prize based on position using tournament prize distribution logic
    const title = `🏆 Congratulations! You won ${prizeAmount.toLocaleString()}.`;
    
    // Message format matches documentation - no mention of position
    const message = `You've just claimed a prize of ₦${prizeAmount.toLocaleString()} in your recent tournament victory! Your gameplay was impressive, and your effort paid off. Keep playing and keep winning—more prizes await you in upcoming tournaments.`;
    
    // Triggered within 1 minute after tournament ends and results are processed
    return await exports.createNotification(
      userId,
      title,
      message,
      'tournament_result',
      tournamentId,
      'Tournament'
    );
  } catch (error) {
    console.error('Error sending tournament winner notification:', error);
    return null;
  }
};


// 💸 Withdrawal Successful
// Trigger: Immediately after a user's withdrawal request is processed and approved
exports.notifyWithdrawalSuccess = async (userId, withdrawalAmount, transactionId = null) => {
  try {
    // Check withdrawal_status == "completed" or success == true logic
    const title = `💸 Withdrawal of ₦${withdrawalAmount.toLocaleString()} Successful!`;
    
    // Amount withdrawn is dynamically pulled from the approved request
    const message = `Your withdrawal of ₦${withdrawalAmount.toLocaleString()} has been successfully processed. The funds have been sent to your registered account. Please allow a short while for it to reflect, depending on your payment provider. Thank you for using 64SQURS!`;
    
    // Real-time trigger (as soon as payment API or internal payout confirms success)
    return await exports.createNotification(
      userId,
      title,
      message,
      'transaction_success',
      transactionId,
      'Transaction'
    );
  } catch (error) {
    console.error('Error sending withdrawal success notification:', error);
    return null;
  }
};

// 💔 Withdrawal Failed Notification
exports.notifyWithdrawalFailure = async (userId, withdrawalAmount, transactionId = null, reason = 'Unknown error') => {
  try {
    const title = `❌ Withdrawal of ₦${withdrawalAmount.toLocaleString()} Failed`;
    const message = `Your withdrawal request of ₦${withdrawalAmount.toLocaleString()} could not be processed. Reason: ${reason}. Your wallet has been refunded. Please try again or contact support if the issue persists.`;
    
    // Create notification in database
    const notification = await exports.createNotification(
      userId,
      title,
      message,
      'transaction_failed',
      transactionId,
      'Transaction'
    );
    
    // Send push notification
    const pushResult = await exports.sendPushToUser(userId, title, message, {
      type: 'withdrawal_failed',
      amount: withdrawalAmount,
      transactionId: transactionId?.toString(),
      reason,
      url: `/transactions/${transactionId}` // Deep link to transaction details
    });
    
    return {
      notification,
      pushResult,
      success: true
    };
    
  } catch (error) {
    console.error('Error sending withdrawal failure notification:', error);
    return { success: false, error: error.message };
  }
};


// ==================== SYSTEM NOTIFICATIONS ====================

// Send system announcement to all users or specific role
exports.sendSystemAnnouncement = async (title, message, userRole = 'all', options = {}) => {
  try {
    const User = require('../models/User');
    
    let users;
    if (userRole === 'all') {
      users = await User.find({});
    } else {
      users = await User.find({ role: userRole });
    }
    
    if (users.length === 0) return null;
    
    const userIds = users.map(user => user._id);
    
    return await exports.createBulkNotifications(
      userIds,
      title,
      message,
      'system_message',
      null,
      null,
      options
    );
  } catch (error) {
    console.error('Error sending system announcement:', error);
    return null;
  }
};


module.exports = exports;
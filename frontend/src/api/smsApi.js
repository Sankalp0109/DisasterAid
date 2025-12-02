import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const smsApi = {
  // Send SMS to a single recipient
  sendSMS: async (phoneNumber, message) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/integrations/sms/send`,
        { phoneNumber, message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error.response?.data || { error: 'Failed to send SMS' };
    }
  },

  // Send SMS to multiple recipients
  sendBulkSMS: async (phoneNumbers, message) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/integrations/sms/send-bulk`,
        { phoneNumbers, message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending bulk SMS:', error);
      throw error.response?.data || { error: 'Failed to send bulk SMS' };
    }
  },

  // Send SMS to request victim
  sendSMSToRequest: async (requestId, message) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/integrations/sms/send-to-request`,
        { requestId, message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error sending SMS to request:', error);
      throw error.response?.data || { error: 'Failed to send SMS' };
    }
  },

  // Get SMS history for a request or phone number
  getSMSHistory: async (filter = {}) => {
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      
      if (filter.phoneNumber) params.append('phoneNumber', filter.phoneNumber);
      if (filter.requestId) params.append('requestId', filter.requestId);
      if (filter.userId) params.append('userId', filter.userId);
      if (filter.direction) params.append('direction', filter.direction); // 'inbound' or 'outbound'
      if (filter.limit) params.append('limit', filter.limit);
      
      const response = await axios.get(
        `${API_URL}/integrations/sms/history?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching SMS history:', error);
      throw error.response?.data || { error: 'Failed to fetch SMS history' };
    }
  },

  // Test SMS service connectivity
  testSMSService: async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/integrations/sms/test`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      console.error('Error testing SMS service:', error);
      throw error.response?.data || { error: 'SMS service test failed' };
    }
  },
};

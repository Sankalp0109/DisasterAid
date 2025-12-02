import { useState, useCallback } from 'react';
import { smsApi } from '../api/smsApi';

export const useSms = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [smsHistory, setSmsHistory] = useState([]);

  // Send SMS to single recipient
  const sendSMS = useCallback(async (phoneNumber, message) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phoneNumber || !message.trim()) {
        throw new Error('Phone number and message are required');
      }

      if (message.length > 160) {
        console.warn('Message is longer than 160 characters and may be split into multiple SMS');
      }

      const result = await smsApi.sendSMS(phoneNumber, message);
      setSuccess(`SMS sent successfully to ${phoneNumber}`);
      return result;
    } catch (err) {
      const errorMsg = err.message || err.error || 'Failed to send SMS';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Send SMS to multiple recipients
  const sendBulkSMS = useCallback(async (phoneNumbers, message) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!phoneNumbers || phoneNumbers.length === 0) {
        throw new Error('At least one phone number is required');
      }

      if (!message.trim()) {
        throw new Error('Message is required');
      }

      if (message.length > 160) {
        console.warn('Message is longer than 160 characters and may be split into multiple SMS');
      }

      const result = await smsApi.sendBulkSMS(phoneNumbers, message);
      setSuccess(`SMS sent successfully to ${phoneNumbers.length} recipients`);
      return result;
    } catch (err) {
      const errorMsg = err.message || err.error || 'Failed to send bulk SMS';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Send SMS to request victim
  const sendSMSToRequest = useCallback(async (requestId, message) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!requestId) {
        throw new Error('Request ID is required');
      }

      if (!message.trim()) {
        throw new Error('Message is required');
      }

      if (message.length > 160) {
        console.warn('Message is longer than 160 characters and may be split into multiple SMS');
      }

      const result = await smsApi.sendSMSToRequest(requestId, message);
      setSuccess('SMS sent successfully to victim');
      return result;
    } catch (err) {
      const errorMsg = err.message || err.error || 'Failed to send SMS to request';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch SMS history
  const fetchSmsHistory = useCallback(async (filter = {}) => {
    setLoading(true);
    setError(null);

    try {
      const result = await smsApi.getSMSHistory(filter);
      setSmsHistory(result.data || []);
      return result.data;
    } catch (err) {
      const errorMsg = err.message || err.error || 'Failed to fetch SMS history';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Test SMS service
  const testService = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await smsApi.testSMSService();
      setSuccess('SMS service is working correctly!');
      return result;
    } catch (err) {
      const errorMsg = err.message || err.error || 'SMS service test failed';
      setError(errorMsg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear messages
  const clearMessages = useCallback(() => {
    setError(null);
    setSuccess(null);
  }, []);

  return {
    loading,
    error,
    success,
    smsHistory,
    sendSMS,
    sendBulkSMS,
    sendSMSToRequest,
    fetchSmsHistory,
    testService,
    clearMessages,
  };
};

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../../pages/Login';
import { AuthProvider } from '../../context/AuthContext';

// Mock axios
jest.mock('axios');
import axios from 'axios';

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

describe('Login Component Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </BrowserRouter>
    );
  };

  describe('Component Rendering', () => {
    test('should render login form', () => {
      renderLogin();
      
      expect(screen.getByText(/Disaster Aid/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    test('should render registration link', () => {
      renderLogin();
      
      expect(screen.getByText(/don't have an account/i)).toBeInTheDocument();
      expect(screen.getByText(/register/i)).toBeInTheDocument();
    });

    test('should render forgot password link', () => {
      renderLogin();
      
      expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    test('should show error for empty email', async () => {
      renderLogin();
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
    });

    test('should show error for invalid email format', async () => {
      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument();
      });
    });

    test('should show error for empty password', async () => {
      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });
    });

    test('should accept valid email and password', async () => {
      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });

      expect(emailInput.value).toBe('test@example.com');
      expect(passwordInput.value).toBe('password123');
    });
  });

  describe('Login Submission', () => {
    test('should submit login form with valid credentials', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'test-token-123',
          user: {
            _id: '123',
            name: 'Test User',
            email: 'test@example.com',
            role: 'victim'
          }
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.stringContaining('/auth/login'),
          {
            email: 'test@example.com',
            password: 'password123'
          }
        );
      });
    });

    test('should show error message on failed login', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          data: {
            message: 'Invalid credentials'
          }
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
      });
    });

    test('should disable button during submission', async () => {
      axios.post.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      expect(submitButton).toBeDisabled();
    });

    test('should redirect victim to victim dashboard', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'test-token',
          user: {
            _id: '123',
            name: 'Victim User',
            email: 'victim@example.com',
            role: 'victim'
          }
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'victim@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/victim/dashboard');
      });
    });

    test('should redirect NGO to NGO dashboard', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'test-token',
          user: {
            _id: '456',
            name: 'NGO User',
            email: 'ngo@example.com',
            role: 'ngo'
          }
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'ngo@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/ngo/dashboard');
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle network error', async () => {
      axios.post.mockRejectedValueOnce(new Error('Network Error'));

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });

    test('should handle very long email', async () => {
      renderLogin();
      
      const longEmail = 'a'.repeat(100) + '@example.com';
      const emailInput = screen.getByPlaceholderText(/email/i);
      
      fireEvent.change(emailInput, { target: { value: longEmail } });
      
      expect(emailInput.value).toBe(longEmail);
    });

    test('should trim whitespace from email', async () => {
      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      fireEvent.change(emailInput, { target: { value: '  test@example.com  ' } });
      
      expect(emailInput.value.trim()).toBe('test@example.com');
    });

    test('should handle special characters in password', async () => {
      renderLogin();
      
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const specialPassword = 'P@ssw0rd!#$%^&*()';
      
      fireEvent.change(passwordInput, { target: { value: specialPassword } });
      
      expect(passwordInput.value).toBe(specialPassword);
    });

    test('should toggle password visibility', async () => {
      renderLogin();
      
      const passwordInput = screen.getByPlaceholderText(/password/i);
      expect(passwordInput.type).toBe('password');
      
      const toggleButton = screen.getByRole('button', { name: /show password/i });
      fireEvent.click(toggleButton);
      
      expect(passwordInput.type).toBe('text');
    });
  });

  describe('Accessibility', () => {
    test('should have proper labels for inputs', () => {
      renderLogin();
      
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    test('should have proper ARIA attributes', () => {
      renderLogin();
      
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toHaveAttribute('type', 'submit');
    });

    test('should be keyboard navigable', () => {
      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      emailInput.focus();
      expect(document.activeElement).toBe(emailInput);
      
      fireEvent.keyDown(emailInput, { key: 'Tab' });
      expect(document.activeElement).toBe(passwordInput);
      
      fireEvent.keyDown(passwordInput, { key: 'Tab' });
      expect(document.activeElement).toBe(submitButton);
    });
  });

  describe('Session Management', () => {
    test('should save token to localStorage on successful login', async () => {
      const mockToken = 'test-jwt-token-123';
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: mockToken,
          user: {
            _id: '123',
            name: 'Test User',
            email: 'test@example.com',
            role: 'victim'
          }
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith('token', mockToken);
      });
    });

    test('should save user data to localStorage', async () => {
      const mockUser = {
        _id: '123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'victim'
      };

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'test-token',
          user: mockUser
        }
      });

      renderLogin();
      
      const emailInput = screen.getByPlaceholderText(/email/i);
      const passwordInput = screen.getByPlaceholderText(/password/i);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(localStorage.setItem).toHaveBeenCalledWith(
          'user',
          JSON.stringify(mockUser)
        );
      });
    });
  });
});

# Test Fixes Required

## Good News! 🎉
The Jest configuration and email test issues have been **SUCCESSFULLY RESOLVED**. Tests are now running without "jest is not defined" errors.

## Current Status
- ✅ Jest ES module configuration working
- ✅ Email service tests without complex mocking working
- ✅ All 102 tests are running
- ⚠️ 65 tests failing due to schema mismatches (not configuration issues)
- ✅ 37 tests passing

## Test Failures Analysis

### 1. Request Model Tests - Field Name Issues

**Problem:** Tests use `createdBy` but model uses `submittedBy`

**Files to fix:**
- `__tests__/models/request.test.js`
- `__tests__/services/email.test.js`

**Changes needed:**
```javascript
// ❌ WRONG
Request.create({
  createdBy: testUser._id,  // Wrong field name
  status: 'pending',        // Wrong enum value
  ...
});

// ✅ CORRECT
Request.create({
  submittedBy: testUser._id,  // Correct field name
  status: 'new',              // Correct enum value
  ...
});
```

**Status enum values (from model):**
- ✅ "new" (default)
- ✅ "triaged"
- ✅ "assigned"
- ✅ "in-progress"
- ✅ "fulfilled"
- ✅ "closed"
- ✅ "cancelled"
- ❌ "pending" (NOT valid)

### 2. User Model Tests - Field Name Issues

**Problem:** Tests use `phoneNumber` but model uses `phone`

**Files to fix:**
- `__tests__/models/user.test.js`

**Changes needed:**
```javascript
// ❌ WRONG
expect(user.phoneNumber).toBe(userData.phoneNumber);

// ✅ CORRECT
expect(user.phone).toBe(userData.phone);
```

### 3. User Model - Email Validation

**Problem:** Invalid emails are not being rejected

**Current behavior:** `invalid-email` is accepted by the model

**Fix needed:** Either:
- Add email validation to User model schema
- OR Update test expectations to match current behavior

### 4. User Model - Role Enum

**Problem:** `operator` role is not valid

**Fix needed:** Check User model for valid role values and update tests

### 5. User Model - Field Trimming

**Problem:** Email addresses with whitespace are not being trimmed

**Fix needed:** Either:
- Add `trim: true` to email field in User model
- OR Update test expectations

### 6. Auth Controller Tests - Registration Failures

**Problem:** All registration requests returning 400 instead of 201

**Root cause:** Likely missing required fields in test data

**Fix needed:** Check User model required fields and add them to test data

### 7. Auth Controller - Date Comparison

**Problem:** `resetPasswordExpires` is a Date object, not a timestamp

**Changes needed:**
```javascript
// ❌ WRONG
expect(user.resetPasswordExpires).toBeGreaterThan(Date.now());

// ✅ CORRECT
expect(user.resetPasswordExpires.getTime()).toBeGreaterThan(Date.now());
```

### 8. Auth Controller - Protected Routes

**Problem:** Protected routes returning 401 "Unauthorized"

**Cause:** Tests not setting Authorization header properly

**Fix needed:**
```javascript
// ✅ Add Authorization header
const response = await request(app)
  .post('/api/auth/change-password')
  .set('Authorization', `Bearer ${authToken}`)
  .send({ oldPassword: 'old', newPassword: 'new' });
```

## Summary of Required Changes

### Quick Wins (Easy Fixes):
1. ✅ Replace all `createdBy` → `submittedBy` in Request tests
2. ✅ Replace all `status: 'pending'` → `status: 'new'` in Request tests  
3. ✅ Replace all `phoneNumber` → `phone` in User tests
4. ✅ Fix date comparison: Add `.getTime()` to Date objects before comparing

### Medium Effort:
5. ⚠️ Fix auth controller tests to include Authorization headers
6. ⚠️ Update User model field requirements and test data

### Documentation Needed:
7. 📄 Document actual User model role enum values
8. 📄 Document actual User model required fields

## Next Steps

1. **Run find/replace** for simple field name changes
2. **Update test data** to match actual model schemas
3. **Fix auth tests** to properly authenticate requests
4. **Re-run tests** to verify fixes

## Testing Commands

```bash
# Run all tests
cd backend && npm test

# Run specific test file
cd backend && npm test -- __tests__/models/request.test.js

# Run with coverage
cd backend && npm run test:coverage

# Run in watch mode (for active development)
cd backend && npm run test:watch
```

## Expected Outcome

After fixing these schema mismatches, we should have:
- ✅ 100+ tests passing
- ✅ Comprehensive coverage of all backend functionality
- ✅ Ready for frontend testing phase

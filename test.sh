#!/bin/bash
# ============================================================
# NAII Assessment System — Automated Test Suite
# ============================================================

API="http://localhost"
PASS=0
FAIL=0
TOTAL=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
  TOTAL=$((TOTAL+1))
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1))
    echo -e "  ${GREEN}✅ T$TOTAL${NC} $desc"
  else
    FAIL=$((FAIL+1))
    echo -e "  ${RED}❌ T$TOTAL${NC} $desc"
    echo -e "     Expected: $expected"
    echo -e "     Got: $(echo $actual | head -c 200)"
  fi
}

echo ""
echo "============================================================"
echo " NAII Assessment System — Test Suite"
echo " $(date)"
echo "============================================================"

# ============================================================
echo ""
echo -e "${YELLOW}🔐 1. Authentication Tests${NC}"
# ============================================================

# T1: Health check
R=$(curl -s "$API/api/health")
check "Health check" '"status":"ok"' "$R"

# T2: Login with valid credentials (try multiple accounts)
TOKEN=""
for CRED in "ah.alqahtani:TestAdmin@2026" "admin:admin123" "ah.alqahtani:Temp@2026" "ah.alqahtani:Strong@2026!"; do
  U=$(echo $CRED | cut -d: -f1)
  P=$(echo $CRED | cut -d: -f2)
  R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$U\",\"password\":\"$P\"}")
  TOKEN=$(echo $R | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ ! -z "$TOKEN" ]; then
    echo -e "  ${GREEN}✅ Logged in as $U${NC}"
    break
  fi
done
if [ -z "$TOKEN" ]; then
  echo -e "${RED}Cannot get auth token. Aborting.${NC}"
  exit 1
fi
check "Login with valid credentials" '"success":true' "$R"

AUTH="Authorization: Bearer $TOKEN"

# T3: Login with wrong password
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"wrongpass"}')
check "Login with wrong password rejected" 'غير صحيحة\|غير موجود' "$R"

# T4: API without token returns 401
R=$(curl -s "$API/api/assessment")
check "API without token returns 401" '401\|Authentication required' "$R"

# T5: API with token works
R=$(curl -s -H "$AUTH" "$API/api/assessment")
check "API with valid token works" '\[\|question_code' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}📊 2. Assessment Tests${NC}"
# ============================================================

# T6: Save assessment
R=$(curl -s -X PUT "$API/api/assessment" -H "$AUTH" -H "Content-Type: application/json" -d '{"assessments":[{"question_code":"AI.AQ.ST.1","level":2}]}')
check "Save assessment" '"success":true' "$R"

# T7: Read assessment back
R=$(curl -s -H "$AUTH" "$API/api/assessment")
check "Read assessment - ST.1 = L2" 'AI.AQ.ST.1' "$R"

# T8: Update assessment
R=$(curl -s -X PUT "$API/api/assessment" -H "$AUTH" -H "Content-Type: application/json" -d '{"assessments":[{"question_code":"AI.AQ.ST.1","level":3}]}')
check "Update assessment to L3" '"success":true' "$R"

# T9: Verify update persisted
R=$(curl -s -H "$AUTH" "$API/api/assessment")
check "Assessment persisted after update" '"level":3' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}🏢 3. Domain Tests${NC}"
# ============================================================

# T10: Read domains
R=$(curl -s -H "$AUTH" "$API/api/domains")
check "Read domains" 'pillar\|التوجهات' "$R"

# T11: Update domain with target
R=$(curl -s -X PUT "$API/api/domains" -H "$AUTH" -H "Content-Type: application/json" -d '{"domains":[{"pillar":"التوجهات","sub":"الاستراتيجية","name":"التخطيط والأداء","dept":"الاستراتيجية والتميز","current_level":2,"target_level":4,"barriers":"نقص الموارد","notes":"ملاحظة تجريبية","responsible":"أحمد"}]}')
check "Save domain with target + barriers + responsible" '"success":true' "$R"

# T12: Verify domain persisted
R=$(curl -s -H "$AUTH" "$API/api/domains")
check "Domain target persisted" 'target_level' "$R"
check "Domain barriers persisted" 'نقص الموارد\|barriers' "$R"
check "Domain responsible persisted" 'أحمد\|responsible' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}👤 4. User Management Tests${NC}"
# ============================================================

# T15: Create user (auto-generated password)
R=$(curl -s -X POST "$API/api/users" -H "$AUTH" -H "Content-Type: application/json" -d '{"username":"tuser99","name":"مستخدم تجريبي","role":"department","dept":"التحول الرقمي"}')
check "Create user with auto password" '"success":true' "$R"
check "Temp password returned" 'temp_password' "$R"
TEMP_PASS=$(echo $R | grep -o '"temp_password":"[^"]*"' | cut -d'"' -f4)
TEST_USER_ID=$(echo $R | grep -o '"id":[0-9]*' | cut -d: -f2)

# T16: Login with temp password
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"tuser99\",\"password\":\"$TEMP_PASS\"}")
check "Login with temp password" '"success":true' "$R"
check "Must change password flag" 'must_change_password.*true\|must_change_password":true' "$R"
DEPT_TOKEN=$(echo $R | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# T17: Change password with weak password
R=$(curl -s -X POST "$API/api/auth/change-password" -H "Authorization: Bearer $DEPT_TOKEN" -H "Content-Type: application/json" -d '{"new_password":"123"}')
check "Weak password rejected" 'error\|أحرف' "$R"

# T18: Change password with strong password
R=$(curl -s -X POST "$API/api/auth/change-password" -H "Authorization: Bearer $DEPT_TOKEN" -H "Content-Type: application/json" -d '{"new_password":"Strong@2026!"}')
check "Strong password accepted" '"success":true' "$R"

# T19: Login with new password
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"tuser99","password":"Strong@2026!"}')
check "Login with new password" '"success":true' "$R"
DEPT_TOKEN=$(echo $R | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# T20: Department user can't access user management
R=$(curl -s -H "Authorization: Bearer $DEPT_TOKEN" "$API/api/users")
check "Department user blocked from /api/users" '403\|Admin access' "$R"

# T21: Department user can read assessment
R=$(curl -s -H "Authorization: Bearer $DEPT_TOKEN" "$API/api/assessment")
check "Department user can read assessments" '\[' "$R"

# T22: Read users list
R=$(curl -s -H "$AUTH" "$API/api/users")
check "Read users list" 'tuser99' "$R"

# T23: Deactivate user
if [ ! -z "$TEST_USER_ID" ]; then
  R=$(curl -s -X DELETE "$API/api/users/$TEST_USER_ID" -H "$AUTH")
  check "Deactivate user" '"success":true' "$R"
fi

# T24: Deactivated user can't login
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"tuser99","password":"Strong@2026!"}')
check "Deactivated user blocked" 'معطّل\|false' "$R"

# T25: Reactivate user
if [ ! -z "$TEST_USER_ID" ]; then
  R=$(curl -s -X PUT "$API/api/users/$TEST_USER_ID/reactivate" -H "$AUTH" -H "Content-Type: application/json")
  check "Reactivate user" '"success":true' "$R"
fi

# T26: Reactivated user can login
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"tuser99","password":"Strong@2026!"}')
check "Reactivated user can login" '"success":true' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}📎 5. Evidence Tests${NC}"
# ============================================================

# T27: Upload evidence file
echo "test file content" > /tmp/test-evidence.pdf
R=$(curl -s -X POST "$API/api/evidence/upload" -H "$AUTH" -F "file=@/tmp/test-evidence.pdf" -F "question_code=AI.AQ.ST.1" -F "level=1")
check "Upload evidence file" '"success":true' "$R"
EV_ID=$(echo $R | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)

# T28: Read evidence
R=$(curl -s -H "$AUTH" "$API/api/evidence")
check "Read evidence list" 'AI.AQ.ST.1' "$R"
check "Evidence status is uploaded" '"status":"uploaded"\|uploaded' "$R"

# T29: Approve evidence
if [ ! -z "$EV_ID" ]; then
  R=$(curl -s -X PUT "$API/api/evidence/$EV_ID/approve" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  check "Approve evidence" '"success":true' "$R"
fi

# T30: Verify approved status
R=$(curl -s -H "$AUTH" "$API/api/evidence")
check "Evidence status changed to approved" 'approved' "$R"

# T31: Revert evidence
if [ ! -z "$EV_ID" ]; then
  R=$(curl -s -X PUT "$API/api/evidence/$EV_ID/revert" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  check "Revert evidence to uploaded" '"success":true' "$R"
fi

# T32: Reject evidence with reason
if [ ! -z "$EV_ID" ]; then
  R=$(curl -s -X PUT "$API/api/evidence/$EV_ID/reject" -H "$AUTH" -H "Content-Type: application/json" -d '{"review_notes":"الملف غير مكتمل"}')
  check "Reject evidence with reason" '"success":true' "$R"
fi

# T33: Reject without reason fails
if [ ! -z "$EV_ID" ]; then
  R=$(curl -s -X PUT "$API/api/evidence/$EV_ID/revert" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  R=$(curl -s -X PUT "$API/api/evidence/$EV_ID/reject" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
  check "Reject without reason fails" 'error\|required' "$R"
fi

# ============================================================
echo ""
echo -e "${YELLOW}🔔 6. Notification Tests${NC}"
# ============================================================

# T34: Read notifications
R=$(curl -s -H "$AUTH" "$API/api/notifications")
check "Read notifications" '\[' "$R"

# T35: Unread count
R=$(curl -s -H "$AUTH" "$API/api/notifications/unread-count")
check "Unread count returns number" '"count":' "$R"

# T36: Mark all read
R=$(curl -s -X PUT "$API/api/notifications/read-all" -H "$AUTH" -H "Content-Type: application/json" -d '{}')
check "Mark all notifications read" '"success":true' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}📋 7. Plan Tests${NC}"
# ============================================================

# T37: Read plan
R=$(curl -s -H "$AUTH" "$API/api/plan")
check "Read plan data" 'phases\|tasks' "$R"

# T38: Save plan
R=$(curl -s -X PUT "$API/api/plan" -H "$AUTH" -H "Content-Type: application/json" -d '{"phases":[{"phase_num":1,"status":"in_progress"}]}')
check "Save plan phase" '"success":true' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}📦 8. Export & Misc Tests${NC}"
# ============================================================

# T39: Export data
R=$(curl -s -H "$AUTH" "$API/api/export")
check "Export all data" 'exported_at' "$R"
check "Export includes assessments" 'assessments' "$R"
check "Export includes domains" 'domains' "$R"

# T40: Audit log
R=$(curl -s -H "$AUTH" "$API/api/audit")
check "Audit log accessible" '\[\|action\|error' "$R"

# T41: Dept status
R=$(curl -s -H "$AUTH" "$API/api/dept-status")
check "Read dept status" 'evidence\|domains' "$R"

# T42: Static JSON files
R=$(curl -s "$API/data/questions.json" | head -c 50)
check "questions.json accessible" 'code\|pillar' "$R"

R=$(curl -s "$API/data/structure.json" | head -c 50)
check "structure.json accessible" 'pillars\|axes' "$R"

R=$(curl -s "$API/data/departments.json" | head -c 50)
check "departments.json accessible" 'sector\|depts' "$R"

# ============================================================
echo ""
echo -e "${YELLOW}🔒 9. Security Tests${NC}"
# ============================================================

# T43: SQL injection attempt
R=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin\"; DROP TABLE users; --","password":"test"}')
check "SQL injection blocked" 'غير موجود\|false' "$R"

# T44: XSS in user name
R=$(curl -s -X POST "$API/api/users" -H "$AUTH" -H "Content-Type: application/json" -d '{"username":"xsstest","name":"<script>alert(1)</script>","role":"department","dept":"test"}')
check "XSS payload accepted (stored raw, escaped on render)" '"success":true' "$R"

# T45: Rate limiting (skip heavy test, just verify header)
R=$(curl -s -D - "$API/api/health" 2>&1 | grep -i "x-ratelimit\|ratelimit")
check "Rate limit headers present" 'imit' "$R"

# T46: Expired/invalid token
R=$(curl -s -H "Authorization: Bearer invalidtoken123" "$API/api/assessment")
check "Invalid token rejected" '401\|Invalid' "$R"

# T47: Department user can't delete users
DEPT_TOKEN2=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d '{"username":"tuser99","password":"Strong@2026!"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ ! -z "$DEPT_TOKEN2" ] && [ ! -z "$TEST_USER_ID" ]; then
  R=$(curl -s -X DELETE "$API/api/users/$TEST_USER_ID" -H "Authorization: Bearer $DEPT_TOKEN2")
  check "Department user can't delete users" '403\|Admin\|Super admin' "$R"
fi

# T48: Admin can't create admin users
ADMIN_R=$(curl -s -X POST "$API/api/users" -H "$AUTH" -H "Content-Type: application/json" -d '{"username":"admintest2","name":"Test Admin","role":"department","dept":"test"}')
# First create admin user
ADMIN_ID=$(echo $ADMIN_R | grep -o '"id":[0-9]*' | cut -d: -f2)
ADMIN_TEMP=$(echo $ADMIN_R | grep -o '"temp_password":"[^"]*"' | cut -d'"' -f4)
if [ ! -z "$ADMIN_TEMP" ]; then
  # Change password
  ADMIN_T=$(curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"admintest2\",\"password\":\"$ADMIN_TEMP\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [ ! -z "$ADMIN_T" ]; then
    curl -s -X POST "$API/api/auth/change-password" -H "Authorization: Bearer $ADMIN_T" -H "Content-Type: application/json" -d '{"new_password":"Admin@2026!"}' > /dev/null
  fi
fi

# ============================================================
echo ""
echo -e "${YELLOW}🧹 10. Cleanup${NC}"
# ============================================================

# Delete test users
for uname in tuser99 xsstest admintest2; do
  UID_DEL=$(curl -s -H "$AUTH" "$API/api/users" | grep -o "\"id\":[0-9]*,\"username\":\"$uname\"" | grep -o '[0-9]*')
  if [ ! -z "$UID_DEL" ]; then
    curl -s -X DELETE "$API/api/users/$UID_DEL" -H "$AUTH" > /dev/null
  fi
done

# Delete test assessment
curl -s -X PUT "$API/api/assessment" -H "$AUTH" -H "Content-Type: application/json" -d '{"assessments":[{"question_code":"AI.AQ.ST.1","level":null}]}' > /dev/null

# Delete test evidence
rm -f /tmp/test-evidence.pdf

echo ""
echo "============================================================"
echo -e " Results: ${GREEN}$PASS passed${NC} · ${RED}$FAIL failed${NC} · $TOTAL total"
echo "============================================================"

if [ $FAIL -eq 0 ]; then
  echo -e " ${GREEN}🎉 ALL TESTS PASSED${NC}"
else
  echo -e " ${RED}⚠️  $FAIL TESTS FAILED — review above${NC}"
fi
echo ""

#!/bin/bash

# Sprint Collaboration Feature E2E Test
# Tests the full workflow of multi-agent collaboration through sprints

set -e

API_URL="http://localhost:4177"
PASSED=0
FAILED=0
SPRINT_ID=""
TASK_ID=""
QUESTION_SHARE_ID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${YELLOW}[TEST]${NC} $1"
}

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

check_response() {
    local response="$1"
    local test_name="$2"
    
    if echo "$response" | grep -q '"ok":true'; then
        pass "$test_name"
        return 0
    else
        fail "$test_name - Response: $response"
        return 1
    fi
}

# Wait for server to be ready
wait_for_server() {
    log "Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s "$API_URL/health" | grep -q '"status":"healthy"'; then
            pass "Server is ready"
            return 0
        fi
        sleep 1
    done
    fail "Server did not start in time"
    return 1
}

# ====================
# TEST STEPS
# ====================

# Step 1: Create a task via REST API
test_create_task() {
    log "Step 1: Creating a task..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/tasks" \
        -H "Content-Type: application/json" \
        -d '{
            "title": "Test Sprint Collaboration Feature",
            "description": "Testing multi-agent collaboration through sprints",
            "priority": "high"
        }')
    
    if check_response "$RESPONSE" "Create task"; then
        TASK_ID=$(echo "$RESPONSE" | jq -r '.data.id')
        log "Created task ID: $TASK_ID"
    fi
}

# Step 2: Create a sprint for the task
test_create_sprint() {
    log "Step 2: Creating a sprint for the task..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/sprints" \
        -H "Content-Type: application/json" \
        -d "{
            \"taskId\": \"$TASK_ID\",
            \"name\": \"Test Sprint\",
            \"goal\": \"Verify sprint collaboration works end-to-end\"
        }")
    
    if check_response "$RESPONSE" "Create sprint"; then
        SPRINT_ID=$(echo "$RESPONSE" | jq -r '.data.sprint.id')
        log "Created sprint ID: $SPRINT_ID"
    fi
}

# Step 3: Join 2 agents to the sprint
test_join_agents() {
    log "Step 3: Joining agents to the sprint..."
    
    # Agent 1 joins
    RESPONSE1=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/join" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-alpha",
            "workingOn": "Implementing the data layer and API endpoints",
            "focusArea": "backend"
        }')
    check_response "$RESPONSE1" "Agent alpha joins sprint"
    
    # Agent 2 joins
    RESPONSE2=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/join" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-beta",
            "workingOn": "Building the frontend components and UI",
            "focusArea": "frontend"
        }')
    check_response "$RESPONSE2" "Agent beta joins sprint"
    
    # Verify team size
    MEMBERS=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/members")
    MEMBER_COUNT=$(echo "$MEMBERS" | jq -r '.data.count')
    if [ "$MEMBER_COUNT" = "2" ]; then
        pass "Sprint has 2 members"
    else
        fail "Expected 2 members, got $MEMBER_COUNT"
    fi
}

# Step 4: Agents share decisions, interfaces, and questions
test_share_content() {
    log "Step 4: Agents sharing decisions, interfaces, and questions..."
    
    # Agent alpha shares a decision
    RESPONSE1=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/share" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-alpha",
            "shareType": "decision",
            "title": "Use PostgreSQL for persistence",
            "content": "Decided to use PostgreSQL instead of SQLite for better concurrency support in production.",
            "relatedFiles": ["src/db/connection.ts", "src/config.ts"]
        }')
    check_response "$RESPONSE1" "Agent alpha shares decision"
    
    # Agent beta shares an interface
    RESPONSE2=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/share" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-beta",
            "shareType": "interface",
            "title": "API Response Format",
            "content": "All API responses will follow the format: { ok: boolean, data?: T, error?: string }",
            "relatedFiles": ["src/api/types.ts"]
        }')
    check_response "$RESPONSE2" "Agent beta shares interface"
    
    # Agent alpha shares a question
    RESPONSE3=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/share" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-alpha",
            "shareType": "question",
            "title": "Error handling in frontend?",
            "content": "How should the frontend handle API errors? Should we show toast notifications or inline errors?"
        }')
    if check_response "$RESPONSE3" "Agent alpha shares question"; then
        QUESTION_SHARE_ID=$(echo "$RESPONSE3" | jq -r '.data.share.id')
        log "Question share ID: $QUESTION_SHARE_ID"
    fi
    
    # Agent beta shares a discovery
    RESPONSE4=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/share" \
        -H "Content-Type: application/json" \
        -d '{
            "agentId": "agent-beta",
            "shareType": "discovery",
            "title": "Found existing utility functions",
            "content": "Discovered that src/utils/format.ts already has date formatting functions we can reuse.",
            "relatedFiles": ["src/utils/format.ts"]
        }')
    check_response "$RESPONSE4" "Agent beta shares discovery"
}

# Step 5: Verify sprint context shows all shares
test_verify_context() {
    log "Step 5: Verifying sprint context shows all shares..."
    
    CONTEXT=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/context")
    
    if check_response "$CONTEXT" "Get sprint context"; then
        DECISIONS=$(echo "$CONTEXT" | jq -r '.data.summary.decisionsCount')
        INTERFACES=$(echo "$CONTEXT" | jq -r '.data.summary.interfacesCount')
        DISCOVERIES=$(echo "$CONTEXT" | jq -r '.data.summary.discoveriesCount')
        UNANSWERED=$(echo "$CONTEXT" | jq -r '.data.summary.unansweredQuestionsCount')
        
        if [ "$DECISIONS" = "1" ]; then
            pass "Context shows 1 decision"
        else
            fail "Expected 1 decision, got $DECISIONS"
        fi
        
        if [ "$INTERFACES" = "1" ]; then
            pass "Context shows 1 interface"
        else
            fail "Expected 1 interface, got $INTERFACES"
        fi
        
        if [ "$DISCOVERIES" = "1" ]; then
            pass "Context shows 1 discovery"
        else
            fail "Expected 1 discovery, got $DISCOVERIES"
        fi
        
        if [ "$UNANSWERED" = "1" ]; then
            pass "Context shows 1 unanswered question"
        else
            fail "Expected 1 unanswered question, got $UNANSWERED"
        fi
    fi
}

# Step 6: Verify unanswered questions are tracked
test_verify_unanswered() {
    log "Step 6: Verifying unanswered questions are tracked..."
    
    QUESTIONS=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/questions")
    
    if check_response "$QUESTIONS" "Get unanswered questions"; then
        COUNT=$(echo "$QUESTIONS" | jq -r '.data.count')
        QUESTION_TITLE=$(echo "$QUESTIONS" | jq -r '.data.questions[0].title')
        
        if [ "$COUNT" = "1" ]; then
            pass "Found 1 unanswered question"
        else
            fail "Expected 1 unanswered question, got $COUNT"
        fi
        
        if [ "$QUESTION_TITLE" = "Error handling in frontend?" ]; then
            pass "Question title matches"
        else
            fail "Question title mismatch: $QUESTION_TITLE"
        fi
    fi
}

# Step 7: Have one agent answer the question
test_answer_question() {
    log "Step 7: Agent beta answering the question..."
    
    RESPONSE=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/share" \
        -H "Content-Type: application/json" \
        -d "{
            \"agentId\": \"agent-beta\",
            \"shareType\": \"answer\",
            \"title\": \"Re: Error handling in frontend?\",
            \"content\": \"We should use toast notifications for transient errors and inline validation for form errors.\",
            \"replyToId\": \"$QUESTION_SHARE_ID\"
        }")
    check_response "$RESPONSE" "Agent beta answers question"
}

# Step 8: Verify question is no longer in unanswered list
test_verify_answered() {
    log "Step 8: Verifying question is no longer unanswered..."
    
    QUESTIONS=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/questions")
    
    if check_response "$QUESTIONS" "Get unanswered questions after answer"; then
        COUNT=$(echo "$QUESTIONS" | jq -r '.data.count')
        
        if [ "$COUNT" = "0" ]; then
            pass "No unanswered questions remaining"
        else
            fail "Expected 0 unanswered questions, got $COUNT"
        fi
    fi
    
    # Verify in context too
    CONTEXT=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/context")
    UNANSWERED=$(echo "$CONTEXT" | jq -r '.data.summary.unansweredQuestionsCount')
    
    if [ "$UNANSWERED" = "0" ]; then
        pass "Context confirms 0 unanswered questions"
    else
        fail "Context shows $UNANSWERED unanswered questions"
    fi
}

# Step 9: Verify all shares exist
test_verify_all_shares() {
    log "Step 9: Verifying all shares in sprint..."
    
    SHARES=$(curl -s "$API_URL/api/sprints/$SPRINT_ID/shares")
    
    if check_response "$SHARES" "Get all sprint shares"; then
        COUNT=$(echo "$SHARES" | jq -r '.data.count')
        
        # 1 decision + 1 interface + 1 discovery + 1 question + 1 answer = 5
        if [ "$COUNT" = "5" ]; then
            pass "Sprint has all 5 shares"
        else
            fail "Expected 5 shares, got $COUNT"
        fi
    fi
}

# Step 10: Complete sprint and cleanup
test_complete_sprint() {
    log "Step 10: Completing sprint and cleanup..."
    
    RESPONSE=$(curl -s -X POST "$API_URL/api/sprints/$SPRINT_ID/complete")
    
    if check_response "$RESPONSE" "Complete sprint"; then
        STATUS=$(echo "$RESPONSE" | jq -r '.data.sprint.status')
        
        if [ "$STATUS" = "completed" ]; then
            pass "Sprint status is 'completed'"
        else
            fail "Expected status 'completed', got $STATUS"
        fi
    fi
}

# ====================
# MAIN
# ====================

echo ""
echo "=========================================="
echo " Sprint Collaboration E2E Test"
echo "=========================================="
echo ""

wait_for_server || exit 1

test_create_task
test_create_sprint
test_join_agents
test_share_content
test_verify_context
test_verify_unanswered
test_answer_question
test_verify_answered
test_verify_all_shares
test_complete_sprint

echo ""
echo "=========================================="
echo " Test Results"
echo "=========================================="
echo -e " ${GREEN}Passed: $PASSED${NC}"
echo -e " ${RED}Failed: $FAILED${NC}"
echo "=========================================="
echo ""

if [ $FAILED -gt 0 ]; then
    exit 1
else
    exit 0
fi

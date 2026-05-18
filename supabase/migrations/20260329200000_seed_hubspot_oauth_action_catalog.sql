-- Migration: Seed HubSpot actions into oauth_action_catalog
-- 49 actions total: 6 read (get) + 7 list/search + 5 fetch + 1 whoami + 14 create/write + 8 update + 8 delete

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- ═══════════════════════════════════════════════════════════════
-- Read actions (get single record)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'whoami',
 'Retrieve the current authenticated HubSpot user''s ID and email.',
 'https://api.hubapi.com/oauth/v1/access-tokens/:token', 'GET', 'hubspot',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('hubspot', 'HubSpot', 'get_contact',
 'Get a contact by ID.',
 'https://api.hubapi.com/crm/v3/objects/contacts/:contactId', 'GET', 'hubspot',
 '{"type":"object","properties":{"contactId":{"type":"string","description":"HubSpot contact ID"}},"required":["contactId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('hubspot', 'HubSpot', 'get_company',
 'Get a company by ID.',
 'https://api.hubapi.com/crm/v3/objects/companies/:id', 'GET', 'hubspot',
 '{"type":"object","properties":{"id":{"type":"string","description":"Company ID to retrieve"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('hubspot', 'HubSpot', 'get_deal',
 'Get a deal by ID.',
 'https://api.hubapi.com/crm/v3/objects/deals/:dealId', 'GET', 'hubspot',
 '{"type":"object","properties":{"dealId":{"type":"string","description":"The ID of the deal to retrieve"}},"required":["dealId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

('hubspot', 'HubSpot', 'get_ticket',
 'Get a ticket by ID.',
 'https://api.hubapi.com/crm/v3/objects/tickets/:ticketId', 'GET', 'hubspot',
 '{"type":"object","properties":{"ticketId":{"type":"string","description":"HubSpot ticket ID"}},"required":["ticketId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 4),

('hubspot', 'HubSpot', 'get_owner',
 'Get an owner by ID.',
 'https://api.hubapi.com/crm/v3/owners/:ownerId', 'GET', 'hubspot',
 '{"type":"object","properties":{"ownerId":{"type":"string","description":"HubSpot owner ID"}},"required":["ownerId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 5),

('hubspot', 'HubSpot', 'get_marketing_email',
 'Get a marketing email by ID.',
 'https://api.hubapi.com/marketing/v3/emails/:emailId', 'GET', 'hubspot',
 '{"type":"object","properties":{"emailId":{"type":"string","description":"The ID of the marketing email to retrieve"}},"required":["emailId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

-- ═══════════════════════════════════════════════════════════════
-- List actions (read multiple records)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'list_contacts',
 'List contact records.',
 'https://api.hubapi.com/crm/v3/objects/contacts', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('hubspot', 'HubSpot', 'list_companies',
 'List company records.',
 'https://api.hubapi.com/crm/v3/objects/companies', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 8),

('hubspot', 'HubSpot', 'list_deals',
 'List deal records from HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/deals', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 9),

('hubspot', 'HubSpot', 'list_tickets',
 'List support tickets.',
 'https://api.hubapi.com/crm/v3/objects/tickets', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Number of tickets to return per page. Max 100."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 10),

('hubspot', 'HubSpot', 'list_forms',
 'List forms.',
 'https://api.hubapi.com/marketing/v3/forms/', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 11),

('hubspot', 'HubSpot', 'list_marketing_emails',
 'List marketing emails.',
 'https://api.hubapi.com/marketing/v3/emails', 'GET', 'hubspot',
 '{"type":"object","properties":{"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 12),

-- ═══════════════════════════════════════════════════════════════
-- Search actions (read with query)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'search_contacts',
 'Search contacts in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/contacts/search', 'POST', 'hubspot',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query (searches across name, email, phone)"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max results (1-100, default 10)"},"properties":{"type":"array","items":{"type":"string"},"description":"Properties to return (default: common fields)"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 13),

('hubspot', 'HubSpot', 'search_companies',
 'Search companies by criteria.',
 'https://api.hubapi.com/crm/v3/objects/companies/search', 'POST', 'hubspot',
 '{"type":"object","properties":{"name":{"type":"string","description":"Company name to search for"},"domain":{"type":"string","description":"Company domain to search for"},"city":{"type":"string","description":"Company city to search for"},"industry":{"type":"string","description":"Company industry to search for"},"cursor":{"type":"string","description":"Pagination cursor from previous response. Omit for first page."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 14),

('hubspot', 'HubSpot', 'search_deals',
 'Search deals in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/deals/search', 'POST', 'hubspot',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query for deals"},"limit":{"type":"number","minimum":1,"maximum":100,"description":"Max results (1-100, default 10)"},"properties":{"type":"array","items":{"type":"string"},"description":"Properties to return"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 15),

('hubspot', 'HubSpot', 'search_tickets',
 'Search tickets by criteria.',
 'https://api.hubapi.com/crm/v3/objects/tickets/search', 'POST', 'hubspot',
 '{"type":"object","properties":{"query":{"type":"string","description":"Search query string (up to 3000 characters)"},"cursor":{"type":"string","description":"Pagination cursor from previous response"},"limit":{"type":"number","minimum":1,"maximum":200,"description":"Maximum results to return (1-200, default: 50)"},"subject":{"type":"string","description":"Filter by ticket subject (convenience filter)"},"priority":{"type":"string","enum":["LOW","MEDIUM","HIGH"],"description":"Filter by ticket priority"},"category":{"type":"string","description":"Filter by ticket category"},"pipeline":{"type":"string","description":"Filter by pipeline ID"},"pipelineStage":{"type":"string","description":"Filter by pipeline stage ID"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 16),

-- ═══════════════════════════════════════════════════════════════
-- Fetch actions (metadata / schema reads)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'fetch_account_information',
 'Retrieve portal account details, currency settings, timezone, and hosting region.',
 'https://api.hubapi.com/account-info/v3/details', 'GET', 'hubspot',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 17),

('hubspot', 'HubSpot', 'fetch_pipelines',
 'List pipelines and stages for an object type, defaulting to deals.',
 'https://api.hubapi.com/crm/v3/pipelines/:objectType', 'GET', 'hubspot',
 '{"type":"object","properties":{"objectType":{"type":"string","description":"The object type for which to fetch pipelines (e.g. deals, tickets). Defaults to deals."}},"additionalProperties":false}'::jsonb,
 'read', true, true, 18),

('hubspot', 'HubSpot', 'fetch_properties',
 'List CRM property metadata for a specified HubSpot object type.',
 'https://api.hubapi.com/crm/v3/properties/:objectType', 'GET', 'hubspot',
 '{"type":"object","properties":{"objectType":{"type":"string","description":"The CRM object type to fetch properties for (e.g. contacts, companies, deals, tickets)"}},"required":["objectType"],"additionalProperties":false}'::jsonb,
 'read', true, true, 19),

('hubspot', 'HubSpot', 'fetch_roles',
 'List available user roles for a HubSpot enterprise account.',
 'https://api.hubapi.com/settings/v3/users/roles', 'GET', 'hubspot',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 20),

('hubspot', 'HubSpot', 'fetch_custom_objects',
 'Retrieve HubSpot custom object schemas for enterprise accounts.',
 'https://api.hubapi.com/crm/v3/schemas', 'GET', 'hubspot',
 '{"type":"object","properties":{},"additionalProperties":false}'::jsonb,
 'read', true, true, 21),

-- ═══════════════════════════════════════════════════════════════
-- Write actions (create)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'create_contact',
 'Create a new contact in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/contacts', 'POST', 'hubspot',
 '{"type":"object","properties":{"email":{"type":"string","format":"email","description":"Contact email address"},"firstname":{"type":"string","description":"First name"},"lastname":{"type":"string","description":"Last name"},"company":{"type":"string","description":"Company name"},"phone":{"type":"string","description":"Phone number"},"jobtitle":{"type":"string","description":"Job title"},"lifecyclestage":{"type":"string","description":"Lifecycle stage (e.g. lead, customer)"},"properties":{"type":"object","additionalProperties":{"type":"string"},"description":"Additional properties as key-value pairs"}},"required":["email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 22),

('hubspot', 'HubSpot', 'create_company',
 'Create a company record.',
 'https://api.hubapi.com/crm/v3/objects/companies', 'POST', 'hubspot',
 '{"type":"object","properties":{"name":{"type":"string","description":"Company name"},"domain":{"type":"string","description":"Company domain"},"city":{"type":"string","description":"Company city"},"industry":{"type":"string","description":"Company industry"},"phone":{"type":"string","description":"Company phone number"},"website":{"type":"string","description":"Company website URL"}},"additionalProperties":false}'::jsonb,
 'write', false, false, 23),

('hubspot', 'HubSpot', 'create_deal',
 'Create a new deal in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/deals', 'POST', 'hubspot',
 '{"type":"object","properties":{"dealname":{"type":"string","minLength":1,"description":"Deal name"},"amount":{"type":"string","description":"Deal amount"},"dealstage":{"type":"string","description":"Deal stage ID"},"pipeline":{"type":"string","description":"Pipeline ID (default: default)"},"closedate":{"type":"string","description":"Expected close date (ISO 8601)"},"hubspot_owner_id":{"type":"string","description":"Owner ID"},"properties":{"type":"object","additionalProperties":{"type":"string"},"description":"Additional properties"}},"required":["dealname"],"additionalProperties":false}'::jsonb,
 'write', false, false, 24),

('hubspot', 'HubSpot', 'create_ticket',
 'Create a support ticket in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/tickets', 'POST', 'hubspot',
 '{"type":"object","properties":{"subject":{"type":"string","description":"The ticket subject/title"},"content":{"type":"string","description":"The ticket description/content"},"hs_pipeline":{"type":"string","description":"Pipeline ID"},"hs_pipeline_stage":{"type":"string","description":"Pipeline stage ID"},"hs_ticket_priority":{"type":"string","enum":["LOW","MEDIUM","HIGH"],"description":"Ticket priority level"}},"required":["subject"],"additionalProperties":false}'::jsonb,
 'write', false, false, 25),

('hubspot', 'HubSpot', 'create_task',
 'Create a HubSpot task with type, title, priority, assignee, due date, notes, and optional associations to contacts, companies, or deals.',
 'https://api.hubapi.com/crm/v3/objects/tasks', 'POST', 'hubspot',
 '{"type":"object","properties":{"subject":{"type":"string","description":"The title/subject of the task"},"type":{"type":"string","description":"The type of task (CALL, EMAIL, TODO, MEETING, etc.). Defaults to TODO"},"priority":{"type":"string","description":"Priority: LOW, MEDIUM, HIGH. Defaults to MEDIUM"},"dueDate":{"type":"string","description":"Due date in ISO 8601 format"},"notes":{"type":"string","description":"The body/notes of the task"},"assigneeId":{"type":"string","description":"HubSpot owner ID to assign the task to"},"contactIds":{"type":"array","items":{"type":"string"},"description":"Contact IDs to associate with"},"companyIds":{"type":"array","items":{"type":"string"},"description":"Company IDs to associate with"},"dealIds":{"type":"array","items":{"type":"string"},"description":"Deal IDs to associate with"}},"required":["subject","dueDate"],"additionalProperties":false}'::jsonb,
 'write', false, false, 26),

('hubspot', 'HubSpot', 'create_note',
 'Create a HubSpot note with body, timestamp, owner, optional attachments, and an explicit association to a contact, company, deal, or ticket.',
 'https://api.hubapi.com/crm/v3/objects/notes', 'POST', 'hubspot',
 '{"type":"object","properties":{"body":{"type":"string","description":"The note text content. Limited to 65536 characters."},"timestamp":{"type":"string","description":"Note timestamp in ISO 8601 UTC format or Unix timestamp in milliseconds"},"ownerId":{"type":"string","description":"HubSpot owner ID associated with the note"},"attachmentIds":{"type":"array","items":{"type":"string"},"description":"IDs of attachments to associate with the note"},"association":{"type":"object","properties":{"objectType":{"type":"string","enum":["contact","company","deal","ticket"],"description":"Object type to associate the note with"},"objectId":{"type":"string","description":"ID of the record to associate the note with"}},"required":["objectType","objectId"],"description":"Association to a contact, company, deal, or ticket"}},"required":["timestamp","association"],"additionalProperties":false}'::jsonb,
 'write', false, false, 27),

('hubspot', 'HubSpot', 'create_marketing_email',
 'Create a marketing email in HubSpot.',
 'https://api.hubapi.com/marketing/v3/emails', 'POST', 'hubspot',
 '{"type":"object","properties":{"name":{"type":"string","description":"The name of the marketing email"},"subject":{"type":"string","description":"The subject line of the email"},"htmlBody":{"type":"string","description":"The HTML content of the email body"},"textBody":{"type":"string","description":"The plain text content of the email body"},"fromName":{"type":"string","description":"Display name for the email sender"},"fromEmail":{"type":"string","description":"Email address of the sender"},"templatePath":{"type":"string","description":"Path to a HubSpot template"}},"required":["name","subject"],"additionalProperties":false}'::jsonb,
 'write', false, false, 28),

('hubspot', 'HubSpot', 'clone_marketing_email',
 'Clone an existing marketing email.',
 'https://api.hubapi.com/marketing/v3/emails/clone', 'POST', 'hubspot',
 '{"type":"object","properties":{"emailId":{"type":"string","description":"The email ID to clone"},"cloneName":{"type":"string","description":"The name to assign to the cloned email"},"language":{"type":"string","description":"Language code for the cloned email (e.g. en)"}},"required":["emailId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 29),

('hubspot', 'HubSpot', 'create_property',
 'Create a custom CRM property for a specified HubSpot object type.',
 'https://api.hubapi.com/crm/v3/properties/:objectType', 'POST', 'hubspot',
 '{"type":"object","properties":{"objectType":{"type":"string","enum":["contacts","companies","deals","products","tickets","line_items"],"description":"The CRM object type for which the property will be created"},"name":{"type":"string","description":"Internal name of the property (lowercase, alphanumeric and underscores)"},"label":{"type":"string","description":"Display name of the property"},"type":{"type":"string","enum":["string","number","bool","enumeration","datetime","date","phone_number"],"description":"Data type of the property"},"fieldType":{"type":"string","enum":["text","textarea","number","date","select","checkbox","radio","booleancheckbox","file","calculation_equation","calculation_rollup","calculation_score","calculation_date"],"description":"Field type determines the input widget shown in HubSpot"},"groupName":{"type":"string","description":"Property group (defaults to contactinformation)"},"description":{"type":"string","description":"A description of the property"},"displayOrder":{"type":"integer","description":"Order the property appears in its group"},"options":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"value":{"type":"string"},"displayOrder":{"type":"integer"},"hidden":{"type":"boolean"}}},"description":"Required for enumeration types (select, checkbox, radio)"}},"required":["objectType","name","label","type","fieldType"],"additionalProperties":false}'::jsonb,
 'write', false, false, 30),

('hubspot', 'HubSpot', 'create_association',
 'Associate two records together.',
 'https://api.hubapi.com/crm/v3/associations/:fromObjectType/:toObjectType/batch/create', 'POST', 'hubspot',
 '{"type":"object","properties":{"fromObjectType":{"type":"string","description":"Object type to associate from (contacts, companies, deals, tickets)"},"fromObjectId":{"type":"string","description":"ID of the object to associate from"},"toObjectType":{"type":"string","description":"Object type to associate to (contacts, companies, deals, tickets)"},"toObjectId":{"type":"string","description":"ID of the object to associate to"},"associationType":{"type":"string","description":"Association type identifier. If not provided, a default association will be created."},"associationCategory":{"type":"string","enum":["HUBSPOT_DEFINED","USER_DEFINED","INTEGRATOR_DEFINED"],"description":"Category of the association type. Required if associationType is provided."}},"required":["fromObjectType","fromObjectId","toObjectType","toObjectId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 31),

('hubspot', 'HubSpot', 'batch_create_companies',
 'Create multiple companies at once.',
 'https://api.hubapi.com/crm/v3/objects/companies/batch/create', 'POST', 'hubspot',
 '{"type":"object","properties":{"companies":{"type":"array","description":"Array of companies to create","items":{"type":"object","properties":{"name":{"type":"string","description":"Company name"},"domain":{"type":"string","description":"Company domain"},"city":{"type":"string","description":"City"},"industry":{"type":"string","description":"Industry"}}}}},"required":["companies"],"additionalProperties":false}'::jsonb,
 'write', false, false, 32),

('hubspot', 'HubSpot', 'create_user',
 'Provision a HubSpot user with email, role, and team assignments.',
 'https://api.hubapi.com/settings/v3/users/', 'POST', 'hubspot',
 '{"type":"object","properties":{"email":{"type":"string","format":"email","description":"Email address of the user to create"},"firstName":{"type":"string","description":"First name of the user"},"lastName":{"type":"string","description":"Last name of the user"},"roleId":{"type":"string","description":"ID of the role/permission set to assign"},"teamId":{"type":"string","description":"ID of the primary team to assign the user to"},"sendWelcomeEmail":{"type":"boolean","description":"Whether to send a welcome email. Defaults to true."}},"required":["email"],"additionalProperties":false}'::jsonb,
 'write', false, false, 33),

-- ═══════════════════════════════════════════════════════════════
-- Write actions (update)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'update_contact',
 'Update a contact record.',
 'https://api.hubapi.com/crm/v3/objects/contacts/:contactId', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"contactId":{"type":"string","description":"The ID of the contact to update"},"firstName":{"type":"string","description":"First name"},"lastName":{"type":"string","description":"Last name"},"email":{"type":"string","description":"Email address"},"phone":{"type":"string","description":"Phone number"},"company":{"type":"string","description":"Company name"},"jobTitle":{"type":"string","description":"Job title"}},"required":["contactId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 34),

('hubspot', 'HubSpot', 'update_company',
 'Update a company record.',
 'https://api.hubapi.com/crm/v3/objects/companies/:id', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"id":{"type":"string","description":"HubSpot company ID"},"name":{"type":"string","description":"Company name"},"domain":{"type":"string","description":"Company domain"},"city":{"type":"string","description":"City"},"state":{"type":"string","description":"State/Region"},"country":{"type":"string","description":"Country"},"industry":{"type":"string","description":"Industry"},"phone":{"type":"string","description":"Phone number"},"website":{"type":"string","description":"Website URL"},"description":{"type":"string","description":"Company description"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'write', true, false, 35),

('hubspot', 'HubSpot', 'update_deal',
 'Update a deal record in HubSpot CRM.',
 'https://api.hubapi.com/crm/v3/objects/deals/:dealId', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"dealId":{"type":"string","description":"The ID of the deal to update"},"dealname":{"type":"string","description":"The name of the deal"},"amount":{"type":"number","description":"The deal amount"},"closedate":{"type":"string","description":"Expected close date (ISO 8601)"},"dealstage":{"type":"string","description":"The stage of the deal (internal stage ID)"},"pipeline":{"type":"string","description":"The pipeline ID for the deal"}},"required":["dealId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 36),

('hubspot', 'HubSpot', 'update_ticket',
 'Update a support ticket.',
 'https://api.hubapi.com/crm/v3/objects/tickets/:ticketId', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"ticketId":{"type":"string","description":"The ID of the ticket to update"},"subject":{"type":"string","description":"The subject of the ticket"},"content":{"type":"string","description":"The content/body of the ticket"},"status":{"type":"string","description":"The status (OPEN, CLOSED, WAITING)"},"priority":{"type":"string","description":"Priority (LOW, MEDIUM, HIGH)"},"category":{"type":"string","description":"The category of the ticket"},"pipeline":{"type":"string","description":"Pipeline the ticket belongs to"},"pipelineStage":{"type":"string","description":"Stage of the ticket in the pipeline"},"ownerId":{"type":"string","description":"ID of the ticket owner"}},"required":["ticketId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 37),

('hubspot', 'HubSpot', 'update_task',
 'Update a HubSpot task''s fields, owner, due date, and associations.',
 'https://api.hubapi.com/crm/v3/objects/tasks/:taskId', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"taskId":{"type":"string","description":"The HubSpot task ID to update"},"subject":{"type":"string","description":"Title of the task"},"body":{"type":"string","description":"Task notes/description"},"dueDate":{"type":"string","description":"Due date in ISO 8601 format or Unix timestamp in milliseconds"},"status":{"type":"string","enum":["COMPLETED","NOT_STARTED"],"description":"Status of the task"},"priority":{"type":"string","enum":["LOW","MEDIUM","HIGH"],"description":"Priority of the task"},"taskType":{"type":"string","enum":["EMAIL","CALL","TODO"],"description":"Type of the task"},"ownerId":{"type":"string","description":"HubSpot owner ID to assign the task to"},"reminder":{"type":"string","description":"Reminder timestamp in Unix milliseconds"}},"required":["taskId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 38),

('hubspot', 'HubSpot', 'update_marketing_email',
 'Update a marketing email.',
 'https://api.hubapi.com/marketing/v3/emails/:emailId', 'PATCH', 'hubspot',
 '{"type":"object","properties":{"emailId":{"type":"string","description":"The ID of the marketing email to update"},"name":{"type":"string","description":"Name of the marketing email"},"subject":{"type":"string","description":"Subject line"},"html":{"type":"string","description":"HTML content"},"fromEmail":{"type":"string","description":"From email address"},"fromName":{"type":"string","description":"From name"},"replyTo":{"type":"string","description":"Reply-to email address"},"previewText":{"type":"string","description":"Preview text for the email"}},"required":["emailId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 39),

('hubspot', 'HubSpot', 'batch_update_companies',
 'Update multiple companies at once.',
 'https://api.hubapi.com/crm/v3/objects/companies/batch/update', 'POST', 'hubspot',
 '{"type":"object","properties":{"companies":{"type":"array","description":"Array of companies to update (max 100 per request)","items":{"type":"object","properties":{"id":{"type":"string","description":"HubSpot company ID"},"name":{"type":"string","description":"Company name"},"domain":{"type":"string","description":"Company domain"},"industry":{"type":"string","description":"Industry"},"city":{"type":"string","description":"City"},"state":{"type":"string","description":"State"},"country":{"type":"string","description":"Country"},"phone":{"type":"string","description":"Phone number"},"website":{"type":"string","description":"Website URL"}},"required":["id"]},"minItems":1,"maxItems":100}},"required":["companies"],"additionalProperties":false}'::jsonb,
 'write', false, false, 40),

('hubspot', 'HubSpot', 'change_user_role',
 'Update a HubSpot user''s role and team assignments.',
 'https://api.hubapi.com/settings/v3/users/:userId', 'PUT', 'hubspot',
 '{"type":"object","properties":{"userId":{"type":"string","description":"User ID or email"},"idProperty":{"type":"string","enum":["EMAIL","USER_ID"],"description":"Property type for the userId. Use EMAIL if userId is an email."},"roleId":{"type":"string","description":"Role ID to assign to the user"},"primaryTeamId":{"type":"string","description":"Primary team ID to assign"},"secondaryTeamIds":{"type":"array","items":{"type":"string"},"description":"Array of secondary team IDs to assign"}},"required":["userId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 41),

-- ═══════════════════════════════════════════════════════════════
-- Destructive actions (delete)
-- ═══════════════════════════════════════════════════════════════

('hubspot', 'HubSpot', 'delete_contact',
 'Delete a contact record.',
 'https://api.hubapi.com/crm/v3/objects/contacts/:contactId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"contactId":{"type":"string","description":"The ID of the contact to delete"}},"required":["contactId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 42),

('hubspot', 'HubSpot', 'delete_company',
 'Delete a company record.',
 'https://api.hubapi.com/crm/v3/objects/companies/:id', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"id":{"type":"string","description":"HubSpot Company ID to delete"}},"required":["id"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 43),

('hubspot', 'HubSpot', 'delete_deal',
 'Delete a deal record.',
 'https://api.hubapi.com/crm/v3/objects/deals/:dealId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"dealId":{"type":"string","description":"The ID of the deal to delete"}},"required":["dealId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 44),

('hubspot', 'HubSpot', 'delete_ticket',
 'Delete a support ticket.',
 'https://api.hubapi.com/crm/v3/objects/tickets/:ticketId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"ticketId":{"type":"string","description":"The ID of the ticket to delete"}},"required":["ticketId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 45),

('hubspot', 'HubSpot', 'delete_task',
 'Delete a HubSpot task by record ID.',
 'https://api.hubapi.com/crm/v3/objects/tasks/:taskId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"taskId":{"type":"string","description":"HubSpot task record ID to delete"}},"required":["taskId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 46),

('hubspot', 'HubSpot', 'delete_marketing_email',
 'Delete a marketing email.',
 'https://api.hubapi.com/marketing/v3/emails/:emailId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"emailId":{"type":"string","description":"The ID of the marketing email to delete"}},"required":["emailId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 47),

('hubspot', 'HubSpot', 'delete_user',
 'Delete a HubSpot provisioned user by ID.',
 'https://api.hubapi.com/settings/v3/users/:userId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"userId":{"type":"string","description":"HubSpot user ID. Can also be an email address if using idProperty=EMAIL."},"idProperty":{"type":"string","enum":["USER_ID","EMAIL"],"description":"Property to use for identifying the user. Defaults to USER_ID."}},"required":["userId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 48),

('hubspot', 'HubSpot', 'delete_a_workflow',
 'Delete an automation workflow.',
 'https://api.hubapi.com/automation/v4/flows/:workflowId', 'DELETE', 'hubspot',
 '{"type":"object","properties":{"workflowId":{"type":"string","description":"The unique identifier for the workflow to delete"}},"required":["workflowId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 49)
ON CONFLICT (provider, action_name) DO NOTHING;

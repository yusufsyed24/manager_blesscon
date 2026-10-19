import { describe, it, expect } from "vitest";
import fs from "node:fs";
const app = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/employee_profile_access_v55_3.sql", import.meta.url), "utf8");
const reset = fs.readFileSync(new URL("../supabase/functions/admin-reset-user-password/index.ts", import.meta.url), "utf8");

describe("v55.3 account access and salesman documents", () => {
  it("does not request or display registered login emails", () => {
    expect(app).not.toContain('invoke("admin-user-directory"');
    expect(app).not.toContain('"Registered login email"');
    expect(app).not.toContain('case "copy-user-email"');
    expect(app).not.toContain('adminUserEmails');
    expect(app).toContain('"Name", "Role", "Linked salesman", "Status", "Actions"');
  });
  it("shows Admin warehouse valuation and separates period profit from loss", () => {
    expect(app).toContain('"Warehouse cartons"');
    expect(app).toContain('"Warehouse boxes"');
    expect(app).toContain('"Estimated market value"');
    expect(app).toContain('"Potential stock profit"');
    expect(app).toContain('"Net profit (period)"');
    expect(app).toContain('"Net loss (period)"');
    expect(app).toContain('warehouse.incompleteProducts');
  });
  it("keeps password resets Admin-only and supports manager/salesman user IDs", () => {
    expect(app).toContain('if (!admin()) throw Error("Only an administrator can reset another user\'s password.")');
    expect(app).toContain('invoke("admin-reset-user-password"');
    expect(reset).toContain('caller.rpc("is_admin")');
    expect(reset).toContain('service.auth.admin.updateUserById(targetId');
    expect(reset).toContain('targetId === authData.user.id');
  });
  it("lets a salesman view/download uploaded private documents", () => {
    expect(app).toContain('select("document_type,file_path,file_name,mime_type,size_bytes,created_at")');
    expect(app).toContain('createSignedUrl(d.file_path, 3600)');
    expect(app).toContain('View / download');
  });
  it("restricts employee document metadata and private uploads to Admin or assigned Manager while allowing employee reads", () => {
    expect(migration).toContain("public.owns_salesman(salesman_id)");
    expect(migration).toContain("sm.manager_user_id = auth.uid()");
    expect(migration).toContain("employee_documents_manager_admin_insert");
    expect(migration).toContain("employee_private_insert");
    expect(migration).toContain("appointment");
    expect(migration).toContain("salary_bank");
    expect(migration.toLowerCase()).not.toMatch(/\btruncate\b|\bdrop table\b|delete from public\./);
  });
});

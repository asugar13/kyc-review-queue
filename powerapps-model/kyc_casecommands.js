// Command-bar decisions for the KYC Case form: Approve / Request information / Escalate.
// Each decision needs a written reason, updates the case, and appends a KYC Case Activity row.
/* global Xrm */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
var KycCase = (function () {
  var FINAL = ["Approved", "Escalated"];

  function optionByLabel(attr, label) {
    return (attr.getOptions() || []).filter(function (o) { return o.text === label; })[0];
  }

  function currentStatusLabel(formCtx) {
    return formCtx.getAttribute("kyc_status").getText();
  }

  function decide(formCtx, statusLabel, actionLabel, summary) {
    var reasonAttr = formCtx.getAttribute("kyc_reviewreason");
    var reason = (reasonAttr.getValue() || "").trim();
    if (FINAL.indexOf(currentStatusLabel(formCtx)) >= 0) {
      Xrm.Navigation.openAlertDialog({ text: "This case is " + currentStatusLabel(formCtx) + " and can no longer be changed." });
      return;
    }
    // Seeded cases carry the routing reason that put them in the queue; a decision needs its own.
    if (!reason || !reasonAttr.getIsDirty()) {
      Xrm.Navigation.openAlertDialog({ text: "Enter a review reason for this decision before recording it." });
      formCtx.getControl("kyc_reviewreason").setFocus();
      return;
    }
    var status = optionByLabel(formCtx.getAttribute("kyc_status"), statusLabel);
    if (!status) { Xrm.Navigation.openAlertDialog({ text: "Status '" + statusLabel + "' is not available." }); return; }

    var caseId = formCtx.data.entity.getId().replace(/[{}]/g, "");
    // Re-read the stored status so a stale tab cannot overwrite a decision made elsewhere,
    // write the history row first, then the case — a failure never leaves a final case without history.
    Xrm.WebApi.retrieveRecord("kyc_case", caseId, "?$select=kyc_status").then(function (current) {
      var storedLabel = current["kyc_status@OData.Community.Display.V1.FormattedValue"];
      if (FINAL.indexOf(storedLabel) >= 0) {
        throw new Error("This case was " + storedLabel.toLowerCase() + " by another reviewer. Refresh to see the latest state.");
      }
      return Xrm.Utility.getEntityMetadata("kyc_caseactivity", ["kyc_action"]);
    }).then(function (meta) {
      var options = meta.Attributes.get("kyc_action").OptionSet;
      var action = (options || []).filter(function (o) { return o.text === actionLabel; })[0];
      var row = {
        kyc_name: summary,
        kyc_reason: reason,
        kyc_reviewer: Xrm.Utility.getGlobalContext().userSettings.userName,
        kyc_occurredat: new Date().toISOString(),
        "kyc_Case@odata.bind": "/kyc_cases(" + caseId + ")"
      };
      if (action) row.kyc_action = action.value;
      return Xrm.WebApi.createRecord("kyc_caseactivity", row);
    }).then(function () {
      formCtx.getAttribute("kyc_status").setValue(status.value);
      if (FINAL.indexOf(statusLabel) >= 0) formCtx.getAttribute("kyc_decidedat").setValue(new Date());
      return formCtx.data.save();
    }).then(function () {
      formCtx.data.refresh(false);
    }).catch(function (err) {
      Xrm.Navigation.openErrorDialog({ message: (err && err.message) || String(err) });
    });
  }

  var DECISION_FIELDS = ["kyc_status", "kyc_reviewreason", "kyc_risklevel", "kyc_flagged", "kyc_assignedreviewer"];

  // Form logic that a business rule would normally carry: a decision needs a written reason,
  // and Approved / Escalated are final states.
  function onLoad(ctx) {
    var formCtx = ctx.getFormContext ? ctx.getFormContext() : ctx;
    var status = currentStatusLabel(formCtx);
    var isFinal = FINAL.indexOf(status) !== -1;
    var reason = formCtx.getAttribute("kyc_reviewreason");
    if (reason) reason.setRequiredLevel(status && status !== "Pending" ? "required" : "none");
    DECISION_FIELDS.forEach(function (name) {
      var control = formCtx.getControl(name);
      if (control && control.setDisabled) control.setDisabled(isFinal);
    });
  }

  return {
    onLoad: onLoad,
    approve: function (formCtx) { decide(formCtx, "Approved", "Approved", "Case approved"); },
    requestInfo: function (formCtx) { decide(formCtx, "Info requested", "Info requested", "Information requested from applicant"); },
    escalate: function (formCtx) { decide(formCtx, "Escalated", "Escalated", "Case escalated to compliance"); }
  };
})();

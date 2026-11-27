# Removing a Google Workspace licence from one person

Usually this is one click: open the person, go to the **Settings** tab, and
under **Google Workspace Licence** press **Remove**.

It is refused when Google assigns that licence automatically. This guide is
about that case.

## Why Google refuses

Google Workspace can give everyone in an organizational unit a licence
automatically. While that is on for a person's unit, Google will not let anyone
assign, change or remove that one person's licence, from Helios, from another
tool or from the Admin console.

Suspending the person does not free the licence. Google bills a suspended
account the same as an active one.

Google's own pages:
[About automatic licensing](https://support.google.com/a/answer/6342682),
[Set automatic licensing for organizational units](https://support.google.com/a/answer/7610656),
[Assign, remove, and reassign licenses](https://support.google.com/a/answer/1727173).

## How to tell this is the cause

When you press **Remove**, Helios answers:

> Google assigns this licence automatically to the person's organizational
> unit, so it cannot be removed from one person.

To confirm it in Google: open the Admin console, go to
**Menu > Billing > License settings**, click the person's organizational unit on
the left, and check whether automatic licensing is **On** for your subscription.

Google reports this refusal in two ways, and Helios recognises both. A real
Workspace answers with an HTTP 400 and the text "the product has auto-assigned
feature enabled". Google's API guide documents an HTTP 412 with "Auto License
un-assignment is not allowed". If you call the Helios API yourself, the answer
is a `409` with `"reason": "automatic_licensing"` and Google's own status in
`googleStatus`.

## Fix 1: a unit for people who are leaving (recommended)

Set up once, then use it for every leaver.

1. **Google Admin console.** Create an organizational unit such as `/Offboarded`.
2. **Google Admin console.** Go to **Menu > Billing > License settings**, click
   that unit, point to your subscription, click **Edit**, choose **Off**, then
   **Override**.
3. **Helios.** Move the person into that unit. In the Developer Console:

   ```
   gw users move person@example.com --ou=/Offboarded
   ```

4. **Helios.** Open the person, go to the **Settings** tab, and press **Remove**
   under Google Workspace Licence. Moving the person does not remove the licence
   by itself, so this step is still needed. If Google still refuses straight
   after the move, wait and try again later; Google's pages say changes to
   licence settings can take up to 24 hours.

## Fix 2: turn automatic licensing off where the person is

1. **Google Admin console.** **Menu > Billing > License settings**, click the
   person's unit (or the top level for everyone), **Edit** the subscription,
   choose **Off**, then **Override**.
2. **Helios.** Press **Remove** as above.

Turning automatic licensing off keeps every licence people already have. From
then on, new people in that unit do not get a licence until you assign one.

## Fix 3: archive the person

Google Admin console only: **Menu > Directory > Users**, the person's
**More options**, **Archive user**. Their data is kept. It needs an Archived
User subscription, which is a paid add-on on Business and Enterprise plans.
Helios does not archive users.

## Fix 4: delete the person

In Helios, delete the person from the Users list, or do it in the Google Admin
console. Transfer anything you want to keep first: Google removes a deleted
account's data after about 20 days. On an annual or fixed-term plan, deleting
someone does not lower the bill until renewal.

## Offboarding and licences

An offboarding run in Helios does not remove Google licences today. The licence
choice in an offboarding template applies to Microsoft 365 only. After
offboarding someone, remove their Google licence with one of the fixes above.

## On a free trial

Nothing is charged during a trial, so a licence you cannot remove costs nothing
yet. Deal with it before the trial ends.

package com.powerresolve.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Mobile-first Android container for the separately hosted PowerResolve Worker.
 * No untrusted JavaScript interfaces and no cleartext traffic are enabled.
 */
public class MainActivity extends Activity {
    private static final int REQUEST_IMAGE = 310;
    private static final int REQUEST_LOCATION = 311;
    private final int navy = Color.rgb(20, 41, 80), blue = Color.rgb(43, 99, 238);
    private SharedPreferences preferences;
    private LinearLayout root;
    private WebView browser;
    private String serviceOrigin;
    private ValueCallback<Uri[]> imageCallback;
    private Uri capturedPhoto;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("powerresolve_settings", MODE_PRIVATE);
        String initial = preferences.getString("service_origin", "");
        if (initial != null && !initial.isEmpty() && isValidHttps(initial)) openService(initial);
        else showConnectionScreen(null);
    }

    private int dp(int value) { return (int)(value * getResources().getDisplayMetrics().density + 0.5f); }
    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
    private TextView text(String value, int sp, int color) {
        TextView t = new TextView(this); t.setText(value); t.setTextSize(sp); t.setTextColor(color); return t;
    }
    private Button button(String value) {
        Button b = new Button(this); b.setText(value); b.setTextColor(Color.WHITE);
        b.setTextSize(15); b.setAllCaps(false); b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(blue));
        b.setMinHeight(dp(52)); return b;
    }
    private void prepareScreen() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(246,248,253)); setContentView(root);
    }
    private String normalizedUrl(String input) {
        try {
            Uri u = Uri.parse(input.trim());
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null || u.getHost().trim().isEmpty()
                || u.getUserInfo() != null || u.getQuery() != null || u.getFragment() != null) return null;
            String host = u.getHost().toLowerCase(java.util.Locale.ROOT);
            if (host.equals("localhost") || host.equals("127.0.0.1") || host.endsWith(".local") || !host.contains(".")) return null;
            if (u.getPort() != -1 && u.getPort() != 443) return null;
            return "https://" + host;
        } catch (Exception e) { return null; }
    }
    private boolean isValidHttps(String raw) { return normalizedUrl(raw) != null; }

    private void showConnectionScreen(String warning) {
        if (browser != null) { browser.destroy(); browser = null; }
        prepareScreen();
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); root.addView(scroll, new LinearLayout.LayoutParams(-1,-1));
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(24),dp(44),dp(24),dp(30)); scroll.addView(content);
        TextView mark=text("⚡",46,blue); mark.setGravity(Gravity.CENTER); content.addView(mark,fullWidth());
        TextView title=text("PowerResolve",30,navy); title.setGravity(Gravity.CENTER); title.setTypeface(null,1);
        content.addView(title,fullWidth());
        TextView sub=text("Electricity complaints, in your pocket",16,Color.DKGRAY); sub.setGravity(Gravity.CENTER);
        content.addView(sub,fullWidth());
        TextView note=text("Connect to your authorized PowerResolve Cloudflare service to register, report faults, attach photos, and track your cases.",15,Color.DKGRAY);
        LinearLayout.LayoutParams noteLp=fullWidth();noteLp.topMargin=dp(30); content.addView(note,noteLp);
        if (warning != null) {
            TextView warn=text(warning,14,Color.rgb(163,35,45));
            LinearLayout.LayoutParams warnLp=fullWidth();warnLp.topMargin=dp(12);content.addView(warn,warnLp);
        }
        TextView label=text("Secure service address (HTTPS)",14,navy);
        LinearLayout.LayoutParams labelLp=fullWidth();labelLp.topMargin=dp(26);content.addView(label,labelLp);
        EditText url=new EditText(this);url.setSingleLine(true);url.setTextSize(16);
        url.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        url.setHint("https://your-worker.workers.dev");url.setText(preferences.getString("service_origin", ""));
        content.addView(url,fullWidth());
        Button connect=button("Connect securely");
        LinearLayout.LayoutParams buttonLp=fullWidth();buttonLp.topMargin=dp(24);content.addView(connect,buttonLp);
        connect.setOnClickListener(v->{
            String candidate=normalizedUrl(url.getText().toString());
            if (candidate==null){url.setError("Enter a valid HTTPS service address");return;}
            preferences.edit().putString("service_origin",candidate).apply();openService(candidate);
        });
        TextView info=text("This research app needs a deployed service to operate. It does not dispatch emergency responders or guarantee power restoration.",13,Color.GRAY);
        LinearLayout.LayoutParams infoLp=fullWidth();infoLp.topMargin=dp(28);content.addView(info,infoLp);
    }

    private void openService(String origin) {
        serviceOrigin=normalizedUrl(origin);if (serviceOrigin==null) {showConnectionScreen("Invalid service URL");return;}
        prepareScreen();
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(18),0,dp(8),0);
        bar.setBackgroundColor(navy);root.addView(bar,new LinearLayout.LayoutParams(-1,dp(50)));
        TextView title=text("⚡ PowerResolve",17,Color.WHITE);title.setTypeface(null,1);
        bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button setting=new Button(this); setting.setText("Server");setting.setAllCaps(false);
        setting.setTextColor(Color.WHITE);setting.setBackgroundTintList(android.content.res.ColorStateList.valueOf(navy));
        bar.addView(setting,new LinearLayout.LayoutParams(dp(89),dp(48)));
        setting.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("Service connection")
            .setMessage("Connected to: "+ serviceOrigin +"\nChange the address only if your administrator gives you a new secure URL.")
            .setPositiveButton("Keep current",null)
            .setNegativeButton("Change server",(dialog,which)->showConnectionScreen(null)).show());
        browser=new WebView(this);
        root.addView(browser,new LinearLayout.LayoutParams(-1,0,1));
        WebSettings settings=browser.getSettings();settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        if(Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                Uri uri=req.getUrl();if (isTrusted(uri))return false;
                if("https".equalsIgnoreCase(uri.getScheme())){
                    try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(ActivityNotFoundException ignored){}
                }return true;
            }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){
                handler.cancel();showConnectionScreen("The HTTPS certificate could not be verified. Check the server address.");
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError error){
                if(req.isForMainFrame())showConnectionScreen("Unable to reach the service. Confirm that the Cloudflare Worker is deployed and your phone is online.");
            }
        });
        browser.setWebChromeClient(new WebChromeClient(){
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(!serviceOrigin.equalsIgnoreCase(origin.replaceAll("/$",""))){callback.invoke(origin,false,false);return;}
                if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED ||
                   checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED){
                    callback.invoke(origin,true,false);
                }else{geoCallback=callback;geoOrigin=origin;requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},REQUEST_LOCATION);}
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(imageCallback!=null)imageCallback.onReceiveValue(null);imageCallback=callback;capturedPhoto=null;
                Intent picker=new Intent(Intent.ACTION_GET_CONTENT);picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                Intent chooser=Intent.createChooser(picker,"Select complaint photo");
                try {
                    ContentValues cv=new ContentValues();
                    cv.put(MediaStore.Images.Media.DISPLAY_NAME,"PowerResolve_"+System.currentTimeMillis()+".jpg");
                    cv.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
                    capturedPhoto=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,cv);
                    Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if(capturedPhoto!=null && camera.resolveActivity(getPackageManager())!=null){
                        camera.putExtra(MediaStore.EXTRA_OUTPUT,capturedPhoto);
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});
                    }
                } catch(Exception ignored){capturedPhoto=null;}
                try{startActivityForResult(chooser,REQUEST_IMAGE);return true;}
                catch(Exception e){imageCallback.onReceiveValue(null);imageCallback=null;return false;}
            }
        });
        browser.loadUrl(serviceOrigin + "/");
    }
    private boolean isTrusted(Uri uri){
        try {Uri base=Uri.parse(serviceOrigin);return "https".equalsIgnoreCase(uri.getScheme()) &&
            base.getHost().equalsIgnoreCase(uri.getHost()) && (uri.getPort()==-1 || uri.getPort()==443);
        } catch(Exception e){return false;}
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request==REQUEST_IMAGE && imageCallback!=null){
            Uri selection=null;
            if(result==RESULT_OK)selection=data!=null && data.getData()!=null ? data.getData():capturedPhoto;
            imageCallback.onReceiveValue(selection==null?null:new Uri[]{selection});imageCallback=null;
            if(result!=RESULT_OK && capturedPhoto!=null){try{getContentResolver().delete(capturedPhoto,null,null);}catch(Exception ignored){}}
            capturedPhoto=null;
        }
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(request,permissions,grants);
        if(request==REQUEST_LOCATION && geoCallback!=null){
            boolean ok=false;for(int p:grants)if(p==PackageManager.PERMISSION_GRANTED)ok=true;
            geoCallback.invoke(geoOrigin,ok,false);geoCallback=null;geoOrigin=null;
        }
    }
    @Override public void onBackPressed(){
        if(browser!=null && browser.canGoBack())browser.goBack();
        else new AlertDialog.Builder(this).setTitle("Exit PowerResolve?")
            .setNegativeButton("Stay",null).setPositiveButton("Exit",(d,w)->finish()).show();
    }
    @Override protected void onDestroy(){if(browser!=null){browser.destroy();browser=null;}super.onDestroy();}
}
